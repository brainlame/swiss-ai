import type pg from 'pg';
import { approvedInputs, classify, TopicError } from './topic-model.ts';
import type { Classifier, SnapshotIssue } from './topic-model.ts';

const LOCK_KEY = 942171506;

const snapshotFields = `c.id, c.behavior, encode(sha256(convert_to(jsonb_build_array(
  c.description, c.improvement, c.constitution_number, p.text, c.behavior,
  c.transcript, c.chat_prompt, c.chat_response
)::text, 'UTF8')), 'hex') as fingerprint`;
const snapshotSource = `from public.cases c
  left join public.constitutions p on p.number = c.constitution_number
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
  >(`select ${snapshotFields}, c.description, c.improvement, coalesce(p.text, 'No principle referenced') as principle,
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
  beforePublish: () => Promise<void> = async () => {},
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

    await beforePublish();
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
