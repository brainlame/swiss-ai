import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import pg from 'pg';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'trending ranks and public live aggregates',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const voters = Array.from({ length: 15 }, () => randomUUID());
    const ids = Array.from({ length: 25 }, () => randomUUID());
    const hidden = [randomUUID(), randomUUID()];
    async function role(name: string, uid = '') {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      await db.query('set role ' + name);
    }
    async function denied(sql: string, params: unknown[] = []) {
      await db.query('savepoint denied');
      await expect(db.query(sql, params)).rejects.toThrow();
      await db.query('rollback to savepoint denied');
    }
    async function browse(cursor?: any) {
      return (
        await db.query(
          "select public.browse_trending_issues(p_search=>'rank-fixture',p_upvotes=>$1,p_time=>$2,p_id=>$3,p_revision=>$4) as data",
          [
            cursor?.upvotes ?? null,
            cursor?.created_at ?? null,
            cursor?.id ?? null,
            cursor?.revision ?? null,
          ],
        )
      ).rows[0].data;
    }
    async function overview() {
      return (await db.query('select public.issue_overview() as data')).rows[0]
        .data;
    }
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      for (const uid of voters)
        await db.query('insert into auth.users(id,email) values($1,$2)', [
          uid,
          uid + '@ranking.fixture.invalid',
        ]);
      for (const [i, id] of [...ids, ...hidden].entries()) {
        await db.query(
          "insert into public.cases(id,constitution_number,description,improvement,status,behavior,created_at) values($1,$2,$3,'rank-proposal',$4,$5,'2026-01-01')",
          [
            id,
            (i % 11) + 1,
            'rank-fixture ' + i,
            i < 25 ? 'published' : i === 25 ? 'draft' : 'deleting',
            i % 3 === 0 ? 'good' : i % 3 === 1 ? 'bad' : null,
          ],
        );
        await db.query('insert into private.case_owners values($1,$2)', [
          id,
          voters[0],
        ]);
        const up = i === 0 ? 9 : i === 1 ? 8 : i % 7;
        for (const [j, uid] of voters.entries()) {
          if (i === 1 && j >= up) continue;
          await db.query(
            'insert into private.case_votes(case_id,user_id,value) values($1,$2,$3)',
            [id, uid, j < up ? 1 : -1],
          );
        }
      }
    });
    afterAll(async () => {
      await db.query('reset role');
      await db.query('rollback');
      await db.end();
    });
    it('ranks by upvotes alone, excludes hidden issues and paginates ties without gaps', async () => {
      await role('anon');
      const expected = (
        await db.query(
          "select id,upvotes from public.cases where description like 'rank-fixture%' and status='published' order by upvotes desc,created_at desc,id desc",
        )
      ).rows;
      let result = await browse();
      const all: any[] = [];
      expect(result.items).toHaveLength(11); // ten and a look-ahead row
      expect(result.items.slice(0, 2).map((r: any) => r.id)).toEqual(
        ids.slice(0, 2),
      );
      const votes = (
        await db.query('select public.case_discussions($1::uuid[]) as data', [
          ids.slice(0, 2),
        ])
      ).rows[0].data;
      expect(votes.find((v: any) => v.case_id === ids[0])).toMatchObject({
        upvotes: 9,
        downvotes: 6,
      });
      expect(votes.find((v: any) => v.case_id === ids[1])).toMatchObject({
        upvotes: 8,
        downvotes: 0,
      });
      while (true) {
        all.push(...result.items.slice(0, 10));
        if (result.items.length <= 10) break;
        result = await browse({
          ...result.items[9],
          revision: result.revision,
        });
      }
      expect(all.map((r) => r.id)).toEqual(expected.map((r) => r.id));
      expect(new Set(all.map((r) => r.id)).size).toBe(25);
      expect(JSON.stringify(all)).not.toMatch(
        /user_id|owner_id|@ranking|chat_prompt|transcript/,
      );
      expect(
        (
          await db.query(
            "select public.browse_trending_issues(p_search=>'rank-proposal',p_constitution=>2) as data",
          )
        ).rows[0].data.items.every((r: any) => r.constitution_number === 2),
      ).toBe(true);
    });
    it('reports complete public totals and all eleven buckets independent of feed filters', async () => {
      await role('anon');
      const stats = await overview();
      const totals = (
        await db.query(
          "select count(*)::int as total,count(*) filter(where behavior='good')::int as good,count(*) filter(where behavior='bad')::int as bad,count(*) filter(where behavior is null)::int as unclassified from public.cases where status='published'",
        )
      ).rows[0];
      expect(stats).toMatchObject({
        total: totals.total,
        behaviors: {
          good: totals.good,
          bad: totals.bad,
          unclassified: totals.unclassified,
        },
      });
      expect(stats.constitutions).toHaveLength(11);
      expect(
        stats.constitutions.reduce((sum: number, c: any) => sum + c.count, 0),
      ).toBe(stats.total);
      expect(JSON.stringify(stats)).not.toMatch(
        /owner|user_id|email|@ranking|description|storage_path/,
      );
      const signal = (await db.query('select * from public.issue_feed_state'))
        .rows[0];
      expect(Object.keys(signal).sort()).toEqual([
        'id',
        'revision',
        'updated_at',
      ]);
    });
    it('prevents direct counter/signal forgery and access to ballots or hidden contributions', async () => {
      for (const [name, uid] of [
        ['anon', ''],
        ['authenticated', voters[0]],
      ]) {
        await role(name, uid);
        await denied('update public.cases set upvotes=9999 where id=$1', [
          ids[0],
        ]);
        await denied('update public.issue_feed_state set revision=9999');
        await denied('insert into public.issue_feed_state(id) values(1)');
        await denied('delete from public.issue_feed_state');
        await denied('select * from private.case_votes');
        await denied('select private.count_case_upvotes()');
        expect((await overview()).total).toBeGreaterThanOrEqual(25);
      }
      await role('anon');
      await denied('select public.vote_case($1,1::smallint)', [ids[0]]);
    });
    it('updates counters atomically, ignores downvote-only changes and rejects stale page cursors', async () => {
      await role('anon');
      const first = await browse(),
        cursor = { ...first.items[9], revision: first.revision };
      await role('authenticated', voters[14]);
      // This account downvoted this issue: remove/re-add a downvote without affecting ranking.
      await db.query('select public.vote_case($1,0::smallint)', [ids[0]]);
      expect((await overview()).revision).toBe(first.revision);
      await db.query('select public.vote_case($1,-1::smallint)', [ids[0]]);
      expect((await overview()).revision).toBe(first.revision);
      await db.query('select public.vote_case($1,1::smallint)', [ids[0]]);
      const updated = await overview();
      expect(updated.revision).not.toBe(first.revision);
      expect((await browse()).items[0].upvotes).toBe(10);
      await db.query('savepoint stale');
      await expect(browse(cursor)).rejects.toMatchObject({ code: '40001' });
      await db.query('rollback to savepoint stale');
      await db.query('select public.vote_case($1,1::smallint)', [ids[0]]);
      expect((await overview()).revision).toBe(updated.revision); // retries are idempotent
      await db.query('select public.vote_case($1,0::smallint)', [ids[0]]);
      expect((await browse()).items[0].upvotes).toBe(9);
      await denied('select public.browse_trending_issues(p_time=>now())');
    });
    it('tracks publish/edit/delete changes while drafts do not invalidate public data', async () => {
      await role(userInfo().username);
      let stats = await overview();
      await db.query(
        "update public.cases set description='private draft' where id=$1",
        [hidden[0]],
      );
      expect((await overview()).revision).toBe(stats.revision);
      await db.query("update public.cases set status='published' where id=$1", [
        hidden[0],
      ]);
      expect((await overview()).total).toBe(stats.total + 1);
      stats = await overview();
      await db.query(
        "update public.cases set behavior='bad',constitution_number=11 where id=$1",
        [hidden[0]],
      );
      expect((await overview()).revision).not.toBe(stats.revision);
      await db.query('delete from public.cases where id=$1', [hidden[0]]);
      expect((await overview()).total).toBe(stats.total - 1);
    });
  },
);

describe.skipIf(!process.env.TEST_DATABASE_URL)('concurrent upvotes', () => {
  it('serializes distinct voters without losing increments or deadlocking', async () => {
    const admin = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const caseId = randomUUID(),
      users = Array.from({ length: 4 }, () => randomUUID());
    const clients = users.map(
      () => new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }),
    );
    await admin.connect();
    try {
      for (const uid of users)
        await admin.query('insert into auth.users(id,email) values($1,$2)', [
          uid,
          'concurrent@ranking.fixture.invalid',
        ]);
      await admin.query(
        "insert into public.cases(id,constitution_number,description,improvement,status) values($1,1,'Concurrent ranking fixture','Proposal','published')",
        [caseId],
      );
      await Promise.all(
        clients.map(async (client, i) => {
          await client.connect();
          await client.query('begin');
          await client.query("set local statement_timeout='5000ms'");
          await client.query(
            "select set_config('request.jwt.claim.sub',$1,true)",
            [users[i]],
          );
          await client.query('set local role authenticated');
          await client.query('select public.vote_case($1,1::smallint)', [
            caseId,
          ]);
          await client.query('commit');
        }),
      );
      expect(
        (
          await admin.query(
            'select upvotes::int from public.cases where id=$1',
            [caseId],
          )
        ).rows[0].upvotes,
      ).toBe(4);
    } finally {
      await Promise.all(
        clients.map(async (client) => {
          try {
            await client.query('rollback');
          } catch {}
          await client.end();
        }),
      );
      await admin.query('delete from public.cases where id=$1', [caseId]);
      await admin.query('delete from auth.users where id=any($1::uuid[])', [
        users,
      ]);
      await admin.end();
    }
  });
});
