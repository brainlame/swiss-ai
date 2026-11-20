import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readSnapshot } from '../../scripts/synthesize-topics.ts';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'topic overview and issues without principle references',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const user = randomUUID(),
      issue = randomUUID(),
      topic = 'test-' + randomUUID();
    const evidence = JSON.stringify([
      { role: 'user', text: 'Synthetic greeting' },
      { role: 'assistant', text: 'Hello.' },
    ]);
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users(id) values($1)', [user]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      await db.query('set role authenticated');
    });
    afterAll(async () => {
      await db.query('rollback');
      await db.end();
    });
    it('creates and retries an issue with no principle and includes it in synthesis', async () => {
      const query =
        "select public.save_case($1,1,null,'Synthetic description','Synthetic improvement',$2,'bad') as version";
      expect((await db.query(query, [issue, evidence])).rows[0].version).toBe(
        2,
      );
      expect((await db.query(query, [issue, evidence])).rows[0].version).toBe(
        2,
      );
      const record = (
        await db.query(
          'select constitution_number from public.cases where id=$1',
          [issue],
        )
      ).rows[0];
      expect(record.constitution_number).toBeNull();
      await db.query('reset role');
      expect((await readSnapshot(db)).some((row) => row.id === issue)).toBe(
        true,
      );
    });
    it('counts all public issues by topic, including unclassified, and updates on reassignment', async () => {
      await db.query('reset role');
      await db.query(
        "insert into public.issue_topics(id,name) values($1,'Synthetic topic')",
        [topic],
      );
      await db.query(
        'insert into public.issue_topic_assignments values($1,$2)',
        [issue, topic],
      );
      await db.query('set role anon');
      const overview = (
        await db.query('select public.issue_overview() as data')
      ).rows[0].data;
      expect(overview.topics).toContainEqual({
        id: topic,
        name: 'Synthetic topic',
        count: 1,
      });
      expect(
        overview.topics.reduce((n: number, t: any) => n + t.count, 0),
      ).toBe(overview.total);
      expect(JSON.stringify(overview)).not.toMatch(
        /user_id|email|Synthetic description/,
      );
    });
  },
);
