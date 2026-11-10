import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'issue sorting across the complete corpus',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const ids = Array.from({ length: 24 }, () => randomUUID());
    const author = randomUUID();
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users(id) values($1)', [author]);
      for (let i = 0; i < ids.length; i++) {
        await db.query(
          `insert into public.cases
        (id,constitution_number,description,improvement,status,created_at,is_sample,upvotes,sample_wanted_votes,sample_unwanted_votes)
        values($1,2,'sorting-fixture','sorting-proposal','published',now()-($2::int*interval '1 hour'),true,$3::integer,$3::integer,$4::integer)`,
          [
            ids[i],
            i === 0 ? 720 : i,
            i === 0 ? 100 : i === 23 ? 0 : 10,
            i === 22 ? 10 : 0,
          ],
        );
      }
      await db.query(
        "insert into public.issue_topics values('sorting-fixture','Sorting fixture')",
      );
      await db.query(
        "insert into public.issue_topic_assignments select unnest($1::uuid[]),'sorting-fixture'",
        [ids],
      );
      for (let i = 0; i < 3; i++)
        await db.query(
          "insert into public.case_comments(case_id,body,stance) values($1,'Synthetic reason','wanted')",
          [ids[10]],
        );
      await db.query('set role anon');
    });
    afterAll(async () => {
      await db.query('rollback');
      await db.query('reset role');
      await db.end();
    });
    async function feed(sort = 'trending', cursor?: any) {
      return (
        await db.query(
          `select public.browse_ranked_issues(
      p_search=>'sorting-fixture',p_constitution=>2,p_topic=>'sorting-fixture',
      p_sort=>$1,p_offset=>$2,p_asof=>$3,p_revision=>$4) as feed`,
          [
            sort,
            cursor?.offset ?? 0,
            cursor?.asof ?? null,
            cursor?.revision ?? null,
          ],
        )
      ).rows[0].feed;
    }
    it('uses both votes and age, counts comments, and excludes zero-vote controversy', async () => {
      expect((await feed()).items[0].id).toBe(ids[1]); // Recent 10 beats month-old 100.
      expect((await feed('discussed')).items[0].id).toBe(ids[10]);
      const controversial = await feed('controversial');
      expect(controversial.items[0].id).toBe(ids[22]); // Exact 10/10 balance.
      expect(controversial.items.some((x: any) => x.id === ids[23])).toBe(
        false,
      );
      expect(JSON.stringify(controversial.items)).not.toMatch(
        /wanted|unwanted|score|user_id/,
      );
    });
    it('keeps all filters and ranking time across pages, with stable ties and no duplicates', async () => {
      for (const sort of ['trending', 'discussed', 'controversial']) {
        let page = await feed(sort);
        const all = [];
        while (true) {
          all.push(...page.items.slice(0, 10));
          if (page.items.length <= 10) break;
          page = await feed(sort, { ...page, offset: page.offset + 10 });
        }
        expect(all).toHaveLength(sort === 'controversial' ? 23 : 24);
        expect(new Set(all.map((x: any) => x.id)).size).toBe(all.length);
      }
    });
    it('invalidates comment-based cursors after new discussion activity', async () => {
      const page = await feed('discussed');
      await db.query('reset role');
      await db.query(
        "insert into public.case_comments(case_id,body) values($1,'New synthetic reason')",
        [ids[1]],
      );
      await db.query('set role anon');
      await db.query('savepoint stale');
      await expect(feed('discussed', { ...page, offset: 10 })).rejects.toThrow(
        'Refresh',
      );
      await db.query('rollback to savepoint stale');
    });
  },
);
