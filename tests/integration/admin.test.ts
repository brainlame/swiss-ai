import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { manageAdmins } from '../../scripts/admins.ts';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'admin moderation and direct database permissions',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const api = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const [owner, voter, regular, admin] = Array.from({ length: 4 }, () =>
      randomUUID(),
    );
    const [issue, other, ownerIssue] = Array.from({ length: 3 }, () =>
      randomUUID(),
    );
    const [root, reply] = [randomUUID(), randomUUID()];
    const topic = 'admin-' + randomUUID();
    const path = issue + '/' + randomUUID() + '.png';
    async function role(uid = '') {
      await api.query('reset role');
      await api.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      await api.query('set role ' + (uid ? 'authenticated' : 'anon'));
    }
    async function summary(id = issue) {
      return (
        await api.query(
          'select public.case_discussions(array[$1::uuid]) as data',
          [id],
        )
      ).rows[0].data[0];
    }
    beforeAll(async () => {
      await db.connect();
      await api.connect();
      for (const id of [owner, voter, regular, admin])
        await db.query('insert into auth.users(id,email) values($1,$2)', [
          id,
          id + '@admin-fixture.invalid',
        ]);
      for (const id of [issue, other, ownerIssue]) {
        await db.query(
          "insert into public.cases(id,constitution_number,description,improvement,status) values($1,1,'admin-fixture issue','Synthetic proposal','published')",
          [id],
        );
        await db.query('insert into private.case_owners values($1,$2)', [
          id,
          owner,
        ]);
      }
      await db.query(
        'insert into private.case_votes(case_id,user_id,value) values($1,$2,1),($1,$3,-1)',
        [issue, owner, voter],
      );
      await db.query(
        "insert into public.case_comments(id,case_id,body) values($1,$2,'Synthetic root')",
        [root, issue],
      );
      await db.query(
        "insert into public.case_comments(id,case_id,parent_id,body) values($1,$2,$3,'Synthetic reply')",
        [reply, issue, root],
      );
      await db.query(
        'insert into private.comment_owners values($1,$3),($2,$3)',
        [root, reply, owner],
      );
      await db.query('insert into public.issue_topics values($1,$2)', [
        topic,
        'Admin fixture ' + topic,
      ]);
      await db.query(
        'insert into public.issue_topic_assignments values($1,$3),($2,$3)',
        [issue, other, topic],
      );
      await db.query(
        "insert into private.uploads(path,case_id,mime_type,byte_size) values($1,$2,'image/png',10)",
        [path, issue],
      );
      await db.query(
        'insert into public.case_screenshots(case_id,storage_path,display_order) values($1,$2,0)',
        [issue, path],
      );
      await db.query(
        "insert into storage.objects(bucket_id,name) values('screenshots',$1)",
        [path],
      );
    });
    afterAll(async () => {
      await api.query('reset role');
      await db.query(
        "delete from storage.objects where bucket_id='screenshots' and name=$1",
        [path],
      );
      await db.query('delete from public.cases where id=any($1::uuid[])', [
        [issue, other, ownerIssue],
      ]);
      await db.query('delete from public.issue_topics where id=$1', [topic]);
      await db.query('delete from auth.users where id=any($1::uuid[])', [
        [owner, voter, regular, admin],
      ]);
      await api.end();
      await db.end();
    });
    it('defaults to non-admin and denies direct membership changes and raw vote access', async () => {
      await role(regular);
      expect(
        (await api.query('select public.is_admin() as allowed')).rows[0]
          .allowed,
      ).toBe(false);
      for (const sql of [
        'select * from private.admin_members',
        'insert into private.admin_members(user_id) values($1)',
        'delete from private.admin_members',
        'select upvotes from public.cases',
        'select sample_unwanted_votes from public.cases',
        'select * from private.case_votes',
        'select private.raw_case_discussions(array[$1::uuid])',
      ])
        await expect(
          api.query(sql, sql.includes('$1') ? [regular] : []),
        ).rejects.toThrow();
      await api.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ user_metadata: { admin: true, role: 'admin' } }),
      ]);
      expect(
        (await api.query('select public.is_admin() as allowed')).rows[0]
          .allowed,
      ).toBe(false);
      await expect(
        api.query(
          'select public.browse_trending_issues(p_upvotes=>1,p_time=>now(),p_id=>$1,p_revision=>(select revision from public.issue_feed_state where id=1))',
          [issue],
        ),
      ).rejects.toThrow('browse_ranked_issues');
      const legacy = (
        await api.query(
          "select public.browse_trending_issues(p_search=>'admin-fixture') as data",
        )
      ).rows[0].data;
      expect(
        legacy.items.every((item: { upvotes: number }) => item.upvotes === 0),
      ).toBe(true);
      const dateFeed = await api.query(
        "select * from public.browse_cases(p_search=>'admin-fixture')",
      );
      expect(dateFeed.rows).toHaveLength(3);
      expect(
        dateFeed.rows.every(
          (item) =>
            Number(item.upvotes) === 0 &&
            item.sample_wanted_votes === 0 &&
            item.sample_unwanted_votes === 0,
        ),
      ).toBe(true);
      expect(
        (await api.query('select public.issue_overview() as data')).rows[0].data
          .upvotes,
      ).toBe(0);
      expect(
        (
          await api.query(
            'delete from storage.objects where name=$1 returning name',
            [path],
          )
        ).rowCount,
      ).toBe(0);
      const data = await summary();
      expect(data).toMatchObject({
        upvotes: 0,
        downvotes: 0,
        total_votes: 2,
        total_comments: 2,
        my_vote: 0,
        can_view_results: false,
      });
      await expect(
        api.query('select public.begin_delete($1)', [issue]),
      ).rejects.toThrow();
      await expect(
        api.query('select public.finish_delete($1)', [issue]),
      ).rejects.toThrow();
    });
    it('manages only existing accounts, grants idempotently and reveals aggregates without ballots', async () => {
      await expect(
        manageAdmins(db, ['grant', '--user-id', randomUUID()]),
      ).rejects.toThrow('No existing');
      await expect(
        manageAdmins(db, ['grant', '--user-id', 'invalid']),
      ).rejects.toThrow('valid');
      const duplicates = [randomUUID(), randomUUID()];
      const duplicateEmail = randomUUID() + '@duplicate.invalid';
      try {
        await db.query(
          'insert into auth.users(id,email) values($1,$3),($2,upper($3))',
          [...duplicates, duplicateEmail],
        );
        await expect(
          manageAdmins(db, ['grant', '--email', duplicateEmail]),
        ).rejects.toThrow('multiple accounts');
      } finally {
        await db.query('delete from auth.users where id=any($1::uuid[])', [
          duplicates,
        ]);
      }
      expect(
        await manageAdmins(db, ['grant', '--user-id', admin]),
      ).toMatchObject({ changed: true });
      expect(
        await manageAdmins(db, [
          'grant',
          '--email',
          admin.toUpperCase() + '@ADMIN-FIXTURE.INVALID',
        ]),
      ).toMatchObject({ changed: false });
      const listed = await manageAdmins(db, ['list']);
      expect(listed.users?.some((row) => row.user_id === admin)).toBe(true);
      await role(admin);
      const votesBefore = (
        await db.query(
          'select count(*) from private.case_votes where case_id=$1',
          [issue],
        )
      ).rows[0].count;
      expect(await summary()).toMatchObject({
        upvotes: 1,
        downvotes: 1,
        my_vote: 0,
        can_view_results: true,
        total_votes: 2,
      });
      expect(
        (
          await db.query(
            'select count(*) from private.case_votes where case_id=$1',
            [issue],
          )
        ).rows[0].count,
      ).toBe(votesBefore);
      await expect(
        api.query('insert into private.admin_members(user_id) values($1)', [
          regular,
        ]),
      ).rejects.toThrow();
      await api.query('select public.vote_case($1,1::smallint)', [issue]);
      expect(await summary()).toMatchObject({
        upvotes: 2,
        downvotes: 1,
        my_vote: 1,
      });
      await api.query('select public.vote_case($1,0::smallint)', [issue]);
    });
    it('revokes privileges on the next request without changing the signed-in account', async () => {
      expect(
        await manageAdmins(db, ['revoke', '--user-id', admin]),
      ).toMatchObject({ changed: true });
      expect(
        await manageAdmins(db, ['revoke', '--user-id', admin]),
      ).toMatchObject({ changed: false });
      expect(await summary()).toMatchObject({
        upvotes: 0,
        downvotes: 0,
        my_vote: 0,
        can_view_results: false,
      });
      await expect(
        api.query('select public.begin_delete($1)', [issue]),
      ).rejects.toThrow();
      await role(owner);
      expect(await summary()).toMatchObject({
        upvotes: 1,
        downvotes: 1,
        my_vote: 1,
      });
      await role();
      expect(await summary()).toMatchObject({
        upvotes: 0,
        downvotes: 0,
        my_vote: 0,
        can_view_results: false,
      });
    });
    it('deletes only the intended issue and dependencies, enforces storage cleanup and handles duplicates', async () => {
      await manageAdmins(db, ['grant', '--user-id', admin]);
      await role(admin);
      const feed = (
        await api.query(
          "select public.browse_ranked_issues(p_search=>'admin-fixture') as data",
        )
      ).rows[0].data;
      const before = (await api.query('select public.issue_overview() as data'))
        .rows[0].data;
      expect(
        (await api.query('select public.begin_delete($1)', [issue])).rows,
      ).toHaveLength(1);
      await expect(
        api.query('select public.finish_delete($1)', [issue]),
      ).rejects.toThrow('Image cleanup');
      await manageAdmins(db, ['revoke', '--user-id', admin]);
      expect(
        (
          await api.query(
            'delete from storage.objects where name=$1 returning name',
            [path],
          )
        ).rowCount,
      ).toBe(0);
      await expect(
        api.query('select public.finish_delete($1)', [issue]),
      ).rejects.toThrow();
      await manageAdmins(db, ['grant', '--user-id', admin]);
      expect(
        (
          await api.query(
            'delete from storage.objects where name=$1 returning name',
            [path],
          )
        ).rowCount,
      ).toBe(1);
      await api.query('select public.finish_delete($1)', [issue]);
      await api.query('select public.begin_delete($1)', [issue]);
      await api.query('select public.finish_delete($1)', [issue]);
      for (const [table, column] of [
        ['public.cases', 'id'],
        ['private.case_owners', 'case_id'],
        ['private.case_votes', 'case_id'],
        ['public.case_comments', 'case_id'],
        ['public.case_screenshots', 'case_id'],
        ['private.uploads', 'case_id'],
        ['public.issue_topic_assignments', 'issue_id'],
      ])
        expect(
          (
            await db.query(
              'select count(*) from ' + table + ' where ' + column + '=$1',
              [issue],
            )
          ).rows[0].count,
        ).toBe('0');
      expect(
        (
          await db.query(
            'select count(*) from private.comment_owners where comment_id=any($1::uuid[])',
            [[root, reply]],
          )
        ).rows[0].count,
      ).toBe('0');
      expect(
        (
          await db.query(
            'select count(*) from public.issue_topics where id=$1',
            [topic],
          )
        ).rows[0].count,
      ).toBe('1');
      expect(
        (
          await db.query('select count(*) from public.cases where id=$1', [
            other,
          ])
        ).rows[0].count,
      ).toBe('1');
      expect(
        (
          await db.query(
            'select count(*) from auth.users where id=any($1::uuid[])',
            [[owner, voter, regular, admin]],
          )
        ).rows[0].count,
      ).toBe('4');
      expect(
        (await db.query('select count(*) from public.constitutions')).rows[0]
          .count,
      ).toBe('11');
      expect(
        (await api.query('select public.issue_overview() as data')).rows[0].data
          .total,
      ).toBe(before.total - 1);
      await expect(
        api.query(
          'select public.browse_ranked_issues(p_offset=>10,p_asof=>$1,p_revision=>$2)',
          [feed.asof, feed.revision],
        ),
      ).rejects.toMatchObject({ code: '40001' });
    });
    it('preserves owner deletion permissions without granting admin access', async () => {
      await role(owner);
      expect(
        (await api.query('select public.is_admin() as allowed')).rows[0]
          .allowed,
      ).toBe(false);
      await api.query('select public.begin_delete($1)', [ownerIssue]);
      await api.query('select public.finish_delete($1)', [ownerIssue]);
      expect(
        (
          await db.query('select count(*) from public.cases where id=$1', [
            ownerIssue,
          ])
        ).rows[0].count,
      ).toBe('0');
    });
  },
);
