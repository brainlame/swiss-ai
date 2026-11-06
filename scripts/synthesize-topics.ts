import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import {
  approvedInputs,
  classify,
  openRouter,
  TopicError,
} from './topic-model.ts';

import type { Classifier, SnapshotIssue } from './topic-model.ts';

const LOCK_KEY = 942171506;

const snapshotFields = `c.id, c.behavior, encode(sha256(convert_to(jsonb_build_array(
  c.description, c.improvement, c.constitution_number, p.text, c.behavior,
  c.transcript, c.chat_prompt, c.chat_response
)::text, 'UTF8')), 'hex') as fingerprint`;
const snapshotSource = `from public.cases c
  join public.constitutions p on p.number = c.constitution_number
  where c.status = 'published'
  order by c.id`;

// Publishing only reads IDs, behavior labels and fingerprints from Postgres.
export async function readSnapshot(db: pg.Client) {
  return (
    await db.query<SnapshotIssue>(`select ${snapshotFields} ${snapshotSource}`)
  ).rows;
}

// Preparation reads evidence locally. The review file remains unapproved.
export async function prepareReview(db: pg.Client) {
  const { rows } = await db.query<
    SnapshotIssue & {
      description: string;
      improvement: string;
      principle: string;
      transcript: { role: 'user' | 'assistant'; text: string }[] | null;
      chat_prompt: string | null;
      chat_response: string | null;
    }
  >(`select ${snapshotFields}, c.description, c.improvement, p.text as principle,
    c.transcript, c.chat_prompt, c.chat_response ${snapshotSource}`);
  return rows.map((row) => ({
    issueId: row.id,
    fingerprint: row.fingerprint,
    approved: false,
    description: row.description,
    improvement: row.improvement,
    principle: row.principle,
    behavior: row.behavior ?? 'unclassified',
    evidence:
      row.transcript
        ?.map(
          ({ role, text }) =>
            `${role === 'user' ? 'User' : 'Assistant'}: ${text}`,
        )
        .join('\n\n') ??
      [
        row.chat_prompt && `User: ${row.chat_prompt}`,
        row.chat_response && `Assistant: ${row.chat_response}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
  }));
}

export async function synthesize(
  db: pg.Client,
  manifest: unknown,
  request: Classifier,
) {
  const { rows } = await db.query(
    'select pg_try_advisory_lock($1::bigint) as locked',
    [LOCK_KEY],
  );
  if (!rows[0].locked)
    throw new TopicError('A topic synthesis run is already in progress.');
  try {
    const snapshot = await readSnapshot(db);
    const inputs = approvedInputs(snapshot, manifest);
    const { topics, assignments } = await classify(inputs, request);
    const issueIds = new Map(
      inputs.map(({ ref }, index) => [ref, snapshot[index].id]),
    );

    await db.query('begin');
    try {
      // Serialize this final check and swap with case and principle writes.
      await db.query("set local lock_timeout = '5s'");
      await db.query(
        'lock table public.cases, public.constitutions in share mode',
      );
      const current = await readSnapshot(db);
      if (JSON.stringify(current) !== JSON.stringify(snapshot))
        throw new TopicError(
          'Published issue content changed during synthesis. Review a fresh snapshot and retry.',
        );
      await db.query(
        'lock table public.issue_topics in share row exclusive mode',
      );
      await db.query('delete from public.issue_topics');
      await db.query(
        `insert into public.issue_topics(id, name)
        select id, name from jsonb_to_recordset($1::jsonb) as t(id text, name text)`,
        [JSON.stringify(topics)],
      );
      const records = assignments.map(({ ref, topic }) => ({
        issue_id: issueIds.get(ref),
        topic_id: topic,
      }));
      await db.query(
        `insert into public.issue_topic_assignments(issue_id, topic_id)
        select issue_id, topic_id from jsonb_to_recordset($1::jsonb) as a(issue_id uuid, topic_id text)`,
        [JSON.stringify(records)],
      );
      const updated = await db.query(`update public.issue_feed_state
        set revision = revision + 1, updated_at = clock_timestamp()
        where id = 1 returning revision::text`);
      if (updated.rowCount !== 1)
        throw new TopicError('The issue feed revision is missing.');
      await db.query('commit');
      return {
        issues: snapshot.length,
        topics: topics.length,
        revision: updated.rows[0].revision,
      };
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  } finally {
    await db.query('select pg_advisory_unlock($1::bigint)', [LOCK_KEY]);
  }
}

async function main() {
  const [mode, file, ...extra] = process.argv.slice(2);
  if (!['prepare', 'publish'].includes(mode) || !file || extra.length)
    throw new TopicError(
      'Usage: npm run topics -- prepare|publish <approval-file.json>',
    );
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString)
    throw new TopicError(
      'Set DATABASE_URL to the Supabase database you want to publish topics to.',
    );
  let target: URL;
  try {
    target = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(target.protocol) ||
      !target.hostname
    )
      throw new Error();
  } catch {
    throw new TopicError(
      'DATABASE_URL must be a PostgreSQL connection string.',
    );
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  let stage: 'connect' | 'query' | 'write' = 'connect';
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? '';
  if (mode === 'publish' && !key)
    throw new TopicError('Set OPENROUTER_API_KEY before publishing.');
  const db = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    stage = 'query';
    if (mode === 'prepare') {
      const manifest = await prepareReview(db);
      stage = 'write';
      await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      console.log(`Prepared ${manifest.length} review entries.`);
    } else {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        throw new TopicError('The approval file could not be read as JSON.');
      }
      const result = await synthesize(db, manifest, openRouter(key));
      console.log(
        `Published ${result.topics} topics for ${result.issues} issues. Feed revision ${result.revision}.`,
      );
    }
  } catch (error) {
    if (error instanceof TopicError) throw error;
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (stage === 'connect') {
      if (code === 'ECONNREFUSED' && local)
        throw new TopicError(
          `PostgreSQL refused the local connection on port ${target.port || '5432'}. Start your local database or set DATABASE_URL to the hosted Supabase Session pooler connection string.`,
        );
      if (code === '28P01' || code === '28000')
        throw new TopicError(
          'PostgreSQL rejected the credentials in DATABASE_URL. Check the database username and password.',
        );
      throw new TopicError(
        'Could not connect to PostgreSQL. Check the DATABASE_URL connection mode, credentials and network access.',
      );
    }
    if (stage === 'write') {
      if (code === 'EEXIST')
        throw new TopicError(
          'The review file already exists. Use a new filename to preserve your existing review.',
        );
      throw new TopicError(
        'Could not write the review file. Check that its parent directory exists and is writable.',
      );
    }
    if (code === '42P01' || code === '42703')
      throw new TopicError(
        'The database is missing required tables or columns. Apply the repository migrations to the database selected by DATABASE_URL.',
      );
    if (code === '42501')
      throw new TopicError(
        'The database role in DATABASE_URL lacks permission for the topic job.',
      );
    throw new TopicError(
      'The topic job could not complete its database query.',
    );
  } finally {
    await db.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    // Provider and database errors can include request data or connection credentials.
    const message =
      error instanceof TopicError
        ? error.message
        : 'Topic job failed. Check database access, migration and file permissions.';
    console.error(message);
    process.exitCode = 1;
  });
}
