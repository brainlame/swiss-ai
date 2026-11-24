import pg from 'pg';
import { automaticManifest } from '../../../scripts/topic-automatic.ts';
import { synthesize } from '../../../scripts/topic-synthesis.ts';
import {
  checkOpenRouterQuota,
  openRouter,
  TopicError,
} from '../../../scripts/topic-model.ts';

// A narrow bridge to the same trusted job used by the CLI. No SQL is supplied by callers.
export async function publishTopics(
  config: { databaseUrl?: string; apiKey?: string },
  beforePublish: () => Promise<void>,
) {
  if (!config.databaseUrl?.trim() || !config.apiKey?.trim())
    throw new TopicError(
      'Configure server-only DATABASE_URL and OPENROUTER_API_KEY before running synthesis.',
    );
  const db = new pg.Client({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    await checkOpenRouterQuota(config.apiKey);
    return await synthesize(
      db,
      automaticManifest,
      openRouter(config.apiKey),
      beforePublish,
    );
  } finally {
    await db.end();
  }
}
