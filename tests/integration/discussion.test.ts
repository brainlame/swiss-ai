import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import pg from 'pg';
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'discussion: direct database permissions, anonymity and pagination',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const owner = randomUUID(),
      other = randomUUID(),
      caseId = randomUUID(),
      secondCase = randomUUID(),
      draft = randomUUID(),
      root = randomUUID(),
      reply = randomUUID();
    async function role(name: string, uid = '') {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      await db.query(`set role ${name}`);
    }
    async function denied(sql: string, args: unknown[] = []) {
      await db.query('savepoint denied');
      await expect(db.query(sql, args)).rejects.toThrow();
      await db.query('rollback to savepoint denied');
    }
    async function summary() {
      return (
        await db.query(
          'select public.case_discussions(array[$1::uuid]) as result',
          [caseId],
        )
      ).rows[0].result[0];
    }
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users values($1,$2),($3,$4)', [
        owner,
        'discussion-owner@fixture.invalid',
        other,
        'discussion-other@fixture.invalid',
      ]);
      for (const id of [caseId, secondCase, draft]) {
        await db.query(
          "insert into public.cases(id,constitution_number,description,improvement,status) values($1,1,'Discussion fixture','Proposal',$2)",
          [id, id === draft ? 'draft' : 'published'],
        );
        await db.query('insert into private.case_owners values($1,$2)', [
          id,
          owner,
        ]);
      }
    });
    afterAll(async () => {
      await db.query('reset role');
      await db.query('rollback');
      await db.end();
    });
    it('allows public counts, but no public ballots or ownership, and no unauthenticated mutations', async () => {
      await role('anon');
      expect(await summary()).toMatchObject({
        upvotes: 0,
        downvotes: 0,
        my_vote: 0,
        comment_count: 0,
        preview: [],
      });
      await denied('select * from private.case_votes');
      await denied('select * from private.comment_owners');
      await denied('select public.vote_case($1,1::smallint)', [caseId]);
      await denied("select public.post_case_comment($1,$2,'comment')", [
        caseId,
        root,
      ]);
      await denied(
        "insert into public.case_comments(case_id,body) values($1,'forged')",
        [caseId],
      );
    });
    it('keeps one changeable vote per account, supports removal and binds auth.uid exclusively', async () => {
      await role('authenticated', owner);
      for (let i = 0; i < 2; i++)
        await db.query('select public.vote_case($1,1::smallint)', [caseId]);
      expect(await summary()).toMatchObject({
        upvotes: 1,
        downvotes: 0,
        my_vote: 1,
      });
      await db.query('select public.vote_case($1,-1::smallint)', [caseId]);
      expect(await summary()).toMatchObject({
        upvotes: 0,
        downvotes: 1,
        my_vote: -1,
      });
      await role('authenticated', other);
      expect(await summary()).toMatchObject({ my_vote: 0 });
      await db.query('select public.vote_case($1,1::smallint)', [caseId]);
      await role('authenticated', owner);
      await db.query('select public.vote_case($1,0::smallint)', [caseId]);
      expect(await summary()).toMatchObject({
        upvotes: 1,
        downvotes: 0,
        my_vote: 0,
      });
      await denied('select public.vote_case($1,2::smallint)', [caseId]);
      await denied('select public.vote_case($1,null::smallint)', [caseId]);
      await denied('insert into private.case_votes values($1,$2,1,now())', [
        caseId,
        other,
      ]);
    });
    it('rejects invalid text and unpublished cases at direct API boundaries', async () => {
      await role('authenticated', owner);
      for (const text of [' \t\n', '\u00a0\u2003', 'x'.repeat(2001), null])
        await denied('select public.post_case_comment($1,$2,$3)', [
          caseId,
          randomUUID(),
          text,
        ]);
      await denied('select public.vote_case($1,1::smallint)', [draft]);
      await denied("select public.post_case_comment($1,$2,'comment')", [
        draft,
        randomUUID(),
      ]);
      await role('anon');
      expect(
        (
          await db.query(
            'select public.case_discussions(array[$1::uuid]) as result',
            [draft],
          )
        ).rows[0].result,
      ).toEqual([]);
      await denied('select public.discussion_comments($1)', [draft]);
    });
    it('creates idempotent anonymous comments/replies and enforces same-case, one-level threads', async () => {
      await role('authenticated', owner);
      for (let i = 0; i < 2; i++)
        expect(
          (
            await db.query(
              "select public.post_case_comment($1,$2,'A useful case')",
              [caseId, root],
            )
          ).rows[0].post_case_comment,
        ).toBe(root);
      await role('authenticated', other);
      await denied("select public.post_case_comment($1,$2,'A useful case')", [
        caseId,
        root,
      ]);
      await db.query(
        "select public.post_case_comment($1,$2,'A considered reply',$3)",
        [caseId, reply, root],
      );
      await denied(
        "select public.post_case_comment($1,$2,'cross-case reply',$3)",
        [secondCase, randomUUID(), root],
      );
      await denied(
        "select public.post_case_comment($1,$2,'nested beyond one level',$3)",
        [caseId, randomUUID(), reply],
      );
      await role('anon');
      const data = await summary();
      expect(data).toMatchObject({
        comment_count: 2,
        root_count: 1,
        my_vote: 0,
      });
      expect(data.preview[0]).toMatchObject({
        author: 'Anonymous',
        reply_count: 1,
        can_delete: false,
      });
      expect(JSON.stringify(data)).not.toMatch(
        /user_id|owner_id|@fixture.invalid/,
      );
      expect(JSON.stringify(data)).not.toContain(owner);
      expect(JSON.stringify(data)).not.toContain(other);
      const direct = (
        await db.query('select * from public.case_comments where case_id=$1', [
          caseId,
        ])
      ).rows;
      expect(direct).toHaveLength(2);
      expect(JSON.stringify(direct)).not.toMatch(
        /user_id|owner_id|@fixture.invalid/,
      );
    });
    it('only authors can delete; tombstones retain replies and cannot be overwritten', async () => {
      await role('authenticated', other);
      await denied('select public.delete_case_comment($1,$2)', [caseId, root]);
      await denied(
        "update public.case_comments set body='forged' where id=$1",
        [root],
      );
      await denied('delete from public.case_comments where id=$1', [root]);
      await role('authenticated', owner);
      await db.query('select public.delete_case_comment($1,$2)', [
        caseId,
        root,
      ]);
      const data = await summary();
      expect(data.preview[0]).toMatchObject({
        is_deleted: true,
        body: '',
        reply_count: 1,
        can_delete: true,
      });
      expect(data.comment_count).toBe(1);
      await denied("select public.post_case_comment($1,$2,'A useful case')", [
        caseId,
        root,
      ]);
      await role('anon');
      expect(
        (
          await db.query('select public.discussion_comments($1,$2) as result', [
            caseId,
            root,
          ])
        ).rows[0].result.items,
      ).toHaveLength(1);
    });
    it('paginates roots and replies with bounded pages and a unique tie-breaker', async () => {
      await role(userInfo().username);
      for (let i = 0; i < 15; i++)
        await db.query(
          "insert into public.case_comments(case_id,body,created_at) values($1,$2,'2020-01-01')",
          [caseId, 'Paging root ' + i],
        );
      for (let i = 0; i < 15; i++)
        await db.query(
          "insert into public.case_comments(case_id,parent_id,body,created_at) values($1,$2,$3,'2020-01-01')",
          [caseId, root, 'Paging reply ' + i],
        );
      await role('anon');
      const first = (
        await db.query('select public.discussion_comments($1) as result', [
          caseId,
        ])
      ).rows[0].result;
      expect(first.items).toHaveLength(10);
      expect(first.has_more).toBe(true);
      const last = first.items.at(-1);
      const next = (
        await db.query(
          'select public.discussion_comments($1,null,$2,$3) as result',
          [caseId, last.created_at, last.id],
        )
      ).rows[0].result;
      expect(next.items).toHaveLength(6);
      expect(next.has_more).toBe(false);
      expect(
        new Set([...first.items, ...next.items].map((c) => c.id)).size,
      ).toBe(16);
      const replies = (
        await db.query('select public.discussion_comments($1,$2) as result', [
          caseId,
          root,
        ])
      ).rows[0].result;
      expect(replies.items).toHaveLength(10);
      expect(replies.has_more).toBe(true);
      const cursor = replies.items.at(-1);
      const more = (
        await db.query(
          'select public.discussion_comments($1,$2,$3,$4) as result',
          [caseId, root, cursor.created_at, cursor.id],
        )
      ).rows[0].result;
      expect(
        new Set([...replies.items, ...more.items].map((c) => c.id)).size,
      ).toBe(16);
      expect((await summary()).preview).toHaveLength(2);
      await denied('select public.case_discussions($1::uuid[])', [
        Array(13).fill(caseId),
      ]);
    });
    it('hides discussion as soon as case deletion begins and cascades public/private records', async () => {
      await role('authenticated', owner);
      await db.query('select public.begin_delete($1)', [caseId]);
      await role('anon');
      expect(await summary()).toBeUndefined();
      expect(
        (
          await db.query(
            'select * from public.case_comments where case_id=$1',
            [caseId],
          )
        ).rows,
      ).toEqual([]);
      await role('authenticated', other);
      await denied('select public.vote_case($1,1::smallint)', [caseId]);
      await denied("select public.post_case_comment($1,$2,'hidden')", [
        caseId,
        randomUUID(),
      ]);
      await role('authenticated', owner);
      await db.query('select public.finish_delete($1)', [caseId]);
      await role(userInfo().username);
      expect(
        (
          await db.query('select * from private.case_votes where case_id=$1', [
            caseId,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            'select * from private.comment_owners where comment_id=$1',
            [root],
          )
        ).rows,
      ).toEqual([]);
    });
  },
);
