import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'profiles, attribution and account deletion',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const owner = randomUUID(),
      other = randomUUID(),
      issue = randomUUID(),
      comment = randomUUID();
    let avatar: string;
    async function role(uid = '') {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        uid,
      ]);
      await db.query('set local role ' + (uid ? 'authenticated' : 'anon'));
    }
    async function denied(sql: string, args: unknown[] = []) {
      await db.query('savepoint denied');
      await expect(db.query(sql, args)).rejects.toThrow();
      await db.query('rollback to savepoint denied');
    }
    async function author() {
      return (
        await db.query('select public.case_authors(array[$1::uuid]) as data', [
          issue,
        ])
      ).rows[0].data[0];
    }
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)', [
        owner,
        other,
        'private@profile.invalid',
        'other@profile.invalid',
      ]);
      await db.query(
        "insert into public.cases(id,description,improvement,status) values($1,'Profile fixture','Improve privacy','published')",
        [issue],
      );
      await db.query('insert into private.case_owners values($1,$2)', [
        issue,
        owner,
      ]);
      await db.query(
        "insert into public.case_comments(id,case_id,body) values($1,$2,'Profile comment')",
        [comment, issue],
      );
      await db.query('insert into private.comment_owners values($1,$2)', [
        comment,
        owner,
      ]);
    });
    afterAll(async () => {
      try {
        await db.query('rollback');
      } finally {
        await db.end();
      }
    });
    it('guards private profile data and self-only updates', async () => {
      await role();
      await denied("select public.save_profile('Jane','Citizen',null)");
      await denied('select * from private.profiles');
      await role(owner);
      await denied("select public.save_profile('   ','Citizen',null)");
      await db.query("select public.save_profile('Jane','Citizen',null)");
      expect(await author()).toMatchObject({
        author: 'Jane Citizen',
        avatar_path: null,
      });
      const profile = (await db.query('select public.my_profile() as data'))
        .rows[0].data;
      expect(profile).toMatchObject({
        first_name: 'Jane',
        last_name: 'Citizen',
      });
      expect(JSON.stringify(profile)).not.toMatch(/@|user_id/);
      await role(other);
      expect(
        (await db.query('select public.my_profile() as data')).rows[0].data
          .first_name,
      ).toBe('');
      await denied('select * from private.profiles');
      await denied('select public.release_account_storage($1)', [owner]);
    });
    it('enforces avatar ownership, size and visibility through Storage RLS', async () => {
      await role(owner);
      await denied("select public.reserve_avatar('image/svg+xml',1)");
      await denied("select public.reserve_avatar('image/png',2097153)");
      avatar = (
        await db.query("select public.reserve_avatar('image/png',10) as path")
      ).rows[0].path;
      expect(avatar).not.toContain(owner);
      await role(other);
      await denied(
        "insert into storage.objects(bucket_id,name) values('avatars',$1)",
        [avatar],
      );
      await denied("select public.save_profile('Other','Person',$1)", [avatar]);
      await role(owner);
      await db.query(
        "insert into storage.objects(bucket_id,name) values('avatars',$1)",
        [avatar],
      );
      await role();
      expect(
        (
          await db.query(
            "select * from storage.objects where bucket_id='avatars' and name=$1",
            [avatar],
          )
        ).rowCount,
      ).toBe(0);
      await role(owner);
      await db.query("select public.save_profile('Jane','Citizen',$1)", [
        avatar,
      ]);
      await role();
      expect(
        (
          await db.query(
            "select name from storage.objects where bucket_id='avatars' and name=$1",
            [avatar],
          )
        ).rowCount,
      ).toBe(1);
      expect(JSON.stringify(await author())).not.toMatch(
        /user_id|private@|owner/,
      );
      const comments = (
        await db.query('select public.discussion_comments($1) as data', [issue])
      ).rows[0].data.items;
      expect(comments[0]).toMatchObject({
        author: 'Jane Citizen',
        avatar_path: avatar,
      });
      await role(other);
      expect(
        (
          await db.query(
            "delete from storage.objects where bucket_id='avatars' and name=$1 returning name",
            [avatar],
          )
        ).rowCount,
      ).toBe(0);
    });
    it('updates prior attribution and retains contributions with Deleted user after Auth deletion', async () => {
      await role(owner);
      await db.query("select public.save_profile('Janet','Citizen',null)");
      expect((await author()).author).toBe('Janet Citizen');
      await db.query(
        "delete from storage.objects where bucket_id='avatars' and name=$1",
        [avatar],
      );
      await db.query('reset role');
      // Exercise both managed Storage owner column variants in the disposable harness.
      await db.query(
        'alter table storage.objects add column if not exists owner uuid, add column if not exists owner_id text',
      );
      const screenshot = issue + '/' + randomUUID() + '.png';
      await db.query(
        "insert into private.uploads(path,case_id,mime_type,byte_size) values($1,$2,'image/png',10)",
        [screenshot, issue],
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,owner,owner_id) values('screenshots',$1,$2::uuid,$2::text)",
        [screenshot, owner],
      );
      await db.query('select public.release_account_storage($1)', [owner]);
      expect(
        (
          await db.query(
            'select owner,owner_id from storage.objects where name=$1',
            [screenshot],
          )
        ).rows[0],
      ).toEqual({ owner: null, owner_id: null });
      await db.query('delete from auth.users where id=$1', [owner]);
      expect(
        (
          await db.query(
            'select count(*) from private.profiles where user_id=$1',
            [owner],
          )
        ).rows[0].count,
      ).toBe('0');
      await role();
      expect(await author()).toMatchObject({
        author: 'Deleted user',
        avatar_path: null,
      });
      const item = (
        await db.query('select public.discussion_comments($1) as data', [issue])
      ).rows[0].data.items[0];
      expect(item).toMatchObject({
        id: comment,
        author: 'Deleted user',
        avatar_path: null,
        can_delete: false,
        body: 'Profile comment',
      });
      expect(
        (await db.query('select id from public.cases where id=$1', [issue]))
          .rowCount,
      ).toBe(1);
    });
  },
);
