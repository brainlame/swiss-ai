import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'isolated SQL chat evidence permissions and lifecycle',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const owner = randomUUID(),
      other = randomUUID(),
      id = randomUUID();
    async function role(name: string, user = '') {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      await db.query(`set role ${name}`);
    }
    async function denied(sql: string, values: unknown[] = []) {
      await db.query('savepoint rejection');
      await expect(db.query(sql, values)).rejects.toThrow();
      await db.query('rollback to savepoint rejection');
    }
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
        owner,
        'chat-owner@fixture.invalid',
        other,
        'chat-other@fixture.invalid',
      ]);
    });
    afterAll(async () => {
      await db.query('reset role');
      await db.query('rollback');
      await db.end();
    });
    it('rejects anonymous creation and partial, blank or overlong evidence', async () => {
      await role('anon');
      await denied(
        "select public.begin_case($1,1::smallint,'description','proposal','hello','reply')",
        [id],
      );
      await role('authenticated', owner);
      for (const pair of [
        ['hello', null],
        [null, 'reply'],
        ['\t\n', 'reply'],
        ['hello', '\u00a0'],
        ['x'.repeat(10001), 'reply'],
      ]) {
        await denied(
          "select public.begin_case($1,1::smallint,'description','proposal',$2,$3)",
          [id, ...pair],
        );
      }
    });
    it('publishes an owner-bound chat case without images and safely retries the empty-image commit', async () => {
      await role('authenticated', owner);
      await db.query(
        "select public.begin_case($1,2::smallint,'Chat example','Describe uncertainty','hello','Hello. What would you like to talk about?')",
        [id],
      );
      await role('anon');
      expect(
        (await db.query('select * from public.cases where id=$1', [id])).rows,
      ).toHaveLength(0);
      await role('authenticated', other);
      await denied(
        "select public.commit_case($1,1,2::smallint,'Chat example','Describe uncertainty',array[]::text[])",
        [id],
      );
      await denied(
        "select public.begin_case($1,2::smallint,'Chat example','Describe uncertainty','forged','reply')",
        [id],
      );
      await role('authenticated', owner);
      for (let index = 0; index < 2; index++) {
        expect(
          (
            await db.query(
              "select public.commit_case($1,1,2::smallint,'Chat example','Describe uncertainty',array[]::text[])",
              [id],
            )
          ).rows[0].commit_case,
        ).toBe(2);
      }
      await role('anon');
      const published = (
        await db.query('select * from public.cases where id=$1', [id])
      ).rows[0];
      expect(published).toMatchObject({
        chat_prompt: 'hello',
        chat_response: 'Hello. What would you like to talk about?',
        status: 'published',
        version: 2,
      });
      expect(Object.keys(published)).not.toEqual(
        expect.arrayContaining(['owner_id', 'user_id', 'email']),
      );
      expect(JSON.stringify(published)).not.toContain(owner);
    });
    it('preserves immutable evidence through edits, database requests and retry attempts', async () => {
      await role('authenticated', owner);
      await denied("update public.cases set chat_prompt='forged' where id=$1", [
        id,
      ]);
      await denied(
        "select public.begin_case($1,2::smallint,'Chat example','Describe uncertainty','changed','reply')",
        [id],
      );
      await db.query(
        "select public.commit_case($1,2,3::smallint,'Updated description','Updated proposal',array[]::text[])",
        [id],
      );
      await role(userInfo().username);
      // Exercise the trigger even under a role with UPDATE privilege.
      await denied(
        'update public.cases set chat_prompt=null,chat_response=null where id=$1',
        [id],
      );
      await denied(
        "update public.cases set chat_response='forged' where id=$1",
        [id],
      );
      expect(
        (
          await db.query('select chat_prompt from public.cases where id=$1', [
            id,
          ])
        ).rows[0].chat_prompt,
      ).toBe('hello');
    });
    it('allows adding and removing optional images, then completely deleting the chat case', async () => {
      await role('authenticated', owner);
      const path = (
        await db.query("select public.reserve_upload($1,'image/png',68)", [id])
      ).rows[0].reserve_upload;
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('screenshots',$1,$2)",
        [path, JSON.stringify({ size: 68, mimetype: 'image/png' })],
      );
      await db.query(
        "select public.commit_case($1,3,3::smallint,'Updated description','Updated proposal',array[$2])",
        [id, path],
      );
      await db.query(
        "select public.commit_case($1,4,3::smallint,'Updated description','Updated proposal',array[]::text[])",
        [id],
      );
      expect(
        (
          await db.query(
            'select * from public.case_screenshots where case_id=$1',
            [id],
          )
        ).rows,
      ).toEqual([]);
      await db.query('delete from storage.objects where name=$1', [path]);
      await db.query('select public.prune_uploads($1)', [id]);
      await role('authenticated', other);
      await denied('select public.begin_delete($1)', [id]);
      await role('authenticated', owner);
      await db.query('select public.begin_delete($1)', [id]);
      await db.query('select public.finish_delete($1)', [id]);
      expect(
        (await db.query('select * from public.cases where id=$1', [id])).rows,
      ).toEqual([]);
      await role(userInfo().username);
      expect(
        (
          await db.query('select * from private.case_owners where case_id=$1', [
            id,
          ])
        ).rows,
      ).toEqual([]);
    });
  },
);
