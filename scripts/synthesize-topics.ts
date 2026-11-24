import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { checkOpenRouterQuota, openRouter, TopicError } from './topic-model.ts';

export { readSnapshot, prepareReview, synthesize } from './topic-synthesis.ts';
import { prepareReview, synthesize } from './topic-synthesis.ts';

async function main() {
  const [mode, file, ...extra] = process.argv.slice(2);
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? '';
  if (mode === 'quota' && !file && !extra.length) {
    if (!key)
      throw new TopicError('Set OPENROUTER_API_KEY before checking quota.');
    const quota = await checkOpenRouterQuota(key);
    console.log(
      quota
        ? `OpenRouter daily free-model requests: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining.`
        : 'OpenRouter did not report a daily free-model request quota.',
    );
    return;
  }
  if (!['prepare', 'publish'].includes(mode) || !file || extra.length)
    throw new TopicError(
      'Usage: npm run topics -- prepare|publish <approval-file.json>, or npm run topics -- quota',
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
      await checkOpenRouterQuota(key);
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
