import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
const enabled = !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)(
  'isolated PostgreSQL: current migrations, direct RPCs, grants and RLS',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const owner = randomUUID(),
      other = randomUUID(),
      id = randomUUID(),
      legacy = randomUUID();
    const transcript = [
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'Hello.' },
      { role: 'user', text: 'more' },
      { role: 'assistant', text: 'A second reply.' },
    ];
    let path: string;
    async function role(name: string, uid = '') {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      await db.query(`set role ${name}`);
    }
    async function denied(sql: string, values: unknown[] = []) {
      await db.query('savepoint rejection');
      await expect(db.query(sql, values)).rejects.toThrow();
      await db.query('rollback to savepoint rejection');
    }
    const save = (
      caseId = id,
      version = 1,
      evidence: unknown = transcript,
      behavior: unknown = 'bad',
      description = 'Conversation fixture',
      constitution = 2,
    ) =>
      db.query(
        'select public.save_case($1,$2,$3::smallint,$4,$5,$6::jsonb,$7)',
        [
          caseId,
          version,
          constitution,
          description,
          'Explain uncertainty',
          evidence === null ? null : JSON.stringify(evidence),
          behavior,
        ],
      );
    async function badSave(
      evidence: unknown,
      behavior: unknown = 'bad',
      description = 'Conversation fixture',
      constitution = 2,
    ) {
      await db.query('savepoint rejection');
      await expect(
        save(randomUUID(), 1, evidence, behavior, description, constitution),
      ).rejects.toThrow();
      await db.query('rollback to savepoint rejection');
    }
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
        owner,
        'owner@fixtures.invalid',
        other,
        'other@fixtures.invalid',
      ]);
      // Historical evidence fixture: insert as the database administrator, not through app creation.
      await db.query(
        "insert into public.cases(id,constitution_number,description,improvement,status,version,chat_prompt,chat_response) values($1,1,'Historical fixture','Historical proposal','published',2,'old prompt','old reply')",
        [legacy],
      );
      await db.query('insert into private.case_owners values($1,$2)', [
        legacy,
        owner,
      ]);
      path = legacy + '/' + randomUUID() + '.png';
      await db.query(
        "insert into private.uploads(path,case_id,mime_type,byte_size) values($1,$2,'image/png',68)",
        [path, legacy],
      );
      await db.query(
        'insert into storage.objects(bucket_id,name,metadata) values(\'screenshots\',$1,\'{"size":68,"mimetype":"image/png"}\')',
        [path],
      );
      await db.query(
        'insert into public.case_screenshots(case_id,storage_path,display_order) values($1,$2,0)',
        [legacy, path],
      );
    });
    afterAll(async () => {
      await db.query('reset role');
      await db.query('rollback');
      await db.end();
    });
    it('provides exactly 11 samples, public historical viewing and private ownership', async () => {
      await role('anon');
      expect(
        (await db.query('select * from public.constitutions')).rows,
      ).toHaveLength(11);
      await denied(
        "update public.constitutions set text='forged' where number=1",
      );
      await denied('select * from private.case_owners');
      await denied('select * from private.uploads');
      expect(
        (
          await db.query(
            'select behavior,transcript,chat_prompt from public.cases where id=$1',
            [legacy],
          )
        ).rows[0],
      ).toEqual({
        behavior: null,
        transcript: null,
        chat_prompt: 'old prompt',
      });
      expect(
        (await db.query('select * from storage.objects where name=$1', [path]))
          .rows,
      ).toHaveLength(1);
      await db.query('savepoint rejection');
      await expect(save()).rejects.toThrow();
      await db.query('rollback to savepoint rejection');
    });
    it('requires full evidence, behavior, meaningful fields and a valid constitution at direct API boundaries', async () => {
      await role('authenticated', owner);
      for (const value of [
        null,
        [],
        {},
        [transcript[0]],
        [transcript[1], transcript[0]],
        [{ role: 'user', text: '\u00a0\t' }, transcript[1]],
        [{ role: 'user', text: 'x'.repeat(10001) }, transcript[1]],
        [{ ...transcript[0], owner_id: owner }, transcript[1]],
        Array.from({ length: 102 }, (_, i) => transcript[i % 2]),
        Array.from({ length: 100 }, (_, i) => ({
          role: i % 2 ? 'assistant' : 'user',
          text: 'x'.repeat(1001),
        })),
      ])
        await badSave(value);
      for (const value of [null, '', 'mixed']) await badSave(transcript, value);
      await badSave(transcript, 'bad', ' \t\n');
      await badSave(transcript, 'bad', 'valid', 12);
      // Old RPC overloads cannot bypass the new creation requirements.
      await denied("select public.begin_case($1,1::smallint,'x','x')", [
        randomUUID(),
      ]);
      await denied("select public.reserve_upload($1,'image/png',68)", [legacy]);
    });
    it('atomically creates and retries one complete owner-bound screenshot-free case', async () => {
      await role('authenticated', owner);
      expect((await save()).rows[0].save_case).toBe(2);
      expect((await save()).rows[0].save_case).toBe(2);
      expect(
        (
          await db.query(
            'select * from public.case_screenshots where case_id=$1',
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      await role('anon');
      const row = (
        await db.query('select * from public.cases where id=$1', [id])
      ).rows[0];
      expect(row).toMatchObject({
        transcript,
        behavior: 'bad',
        status: 'published',
        version: 2,
      });
      expect(JSON.stringify(row)).not.toMatch(
        /owner_id|user_id|@fixtures.invalid/,
      );
      expect(JSON.stringify(row)).not.toContain(owner);
      await denied('select public.browse_cases(p_mine=>true)');
    });
    it('rejects another user’s updates, deletion, owner forgery and screenshot mutation', async () => {
      await role('authenticated', other);
      await db.query('savepoint rejection');
      await expect(save(id, 2)).rejects.toThrow();
      await db.query('rollback to savepoint rejection');
      await denied('select public.begin_delete($1)', [id]);
      await denied("update public.cases set behavior='good' where id=$1", [id]);
      await denied('insert into private.case_owners values($1,$2)', [
        id,
        other,
      ]);
      await denied(
        "insert into storage.objects(bucket_id,name,metadata) values('screenshots',$1,'{}')",
        [id + '/' + randomUUID() + '.png'],
      );
      expect(
        (
          await db.query(
            'delete from storage.objects where name=$1 returning *',
            [path],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "update storage.objects set metadata='{}' where name=$1 returning *",
            [path],
          )
        ).rows,
      ).toEqual([]);
      await denied('delete from public.case_screenshots where case_id=$1', [
        legacy,
      ]);
    });
    it('preserves immutable transcripts and supports versioned owner edits and classification changes', async () => {
      await role('authenticated', owner);
      await badSave(transcript, 'bad', 'valid', 0);
      await db.query('savepoint rejection');
      await expect(save(id, 2, [transcript[0], transcript[1]])).rejects.toThrow(
        'read-only',
      );
      await db.query('rollback to savepoint rejection');
      expect(
        (await save(id, 2, transcript, 'good', 'Edited conversation')).rows[0]
          .save_case,
      ).toBe(3);
      expect(
        (await save(id, 2, transcript, 'good', 'Edited conversation')).rows[0]
          .save_case,
      ).toBe(3);
      await db.query('savepoint rejection');
      await expect(save(id, 1)).rejects.toThrow('Reload');
      await db.query('rollback to savepoint rejection');
      await role(userInfo().username);
      await denied("update public.cases set transcript='[]' where id=$1", [id]);
      await denied(
        "update public.cases set chat_response='changed' where id=$1",
        [legacy],
      );
    });
    it('edits historical cases without changing old screenshots or silently assigning behavior', async () => {
      await role('authenticated', owner);
      expect(
        (
          await db.query('select behavior from public.cases where id=$1', [
            legacy,
          ])
        ).rows[0].behavior,
      ).toBeNull();
      await save(legacy, 2, null, 'good', 'Edited historical case');
      expect(
        (
          await db.query(
            'select * from public.case_screenshots where case_id=$1',
            [legacy],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await db.query(
            'select chat_prompt,chat_response from public.cases where id=$1',
            [legacy],
          )
        ).rows[0],
      ).toEqual({ chat_prompt: 'old prompt', chat_response: 'old reply' });
    });
    it('searches both fields, filters, sorts and paginates tied timestamps in SQL', async () => {
      await role(userInfo().username);
      for (let i = 0; i < 26; i++)
        await db.query(
          "insert into public.cases(constitution_number,description,improvement,status,created_at) values($1,$2,$3,'published','2020-01-01')",
          [
            (i % 2) + 1,
            'pagination ' + i,
            i === 4 ? 'unique-proposal' : 'standard',
          ],
        );
      await role('anon');
      const first = (
        await db.query(
          "select * from public.browse_cases(p_search=>'pagination')",
        )
      ).rows;
      expect(first).toHaveLength(13);
      const next = (
        await db.query(
          "select * from public.browse_cases(p_search=>'pagination',p_time=>$1,p_id=>$2)",
          [first[11].created_at, first[11].id],
        )
      ).rows;
      expect(
        new Set([...first.slice(0, 12), ...next].map((r) => r.id)).size,
      ).toBe(25);
      const ascending = (
        await db.query(
          "select * from public.browse_cases(p_search=>'pagination',p_oldest=>true)",
        )
      ).rows;
      expect(ascending[0].id).not.toBe(first[0].id);
      expect(
        (
          await db.query(
            "select * from public.browse_cases(p_search=>'pagination',p_constitution=>2)",
          )
        ).rows.every((r) => r.constitution_number === 2),
      ).toBe(true);
      expect(
        (
          await db.query(
            "select * from public.browse_cases(p_search=>'unique-proposal')",
          )
        ).rows,
      ).toHaveLength(1);
      await role('authenticated', owner);
      expect(
        (await db.query('select * from public.browse_cases(p_mine=>true)'))
          .rows,
      ).toHaveLength(2);
    });
    it('cleans up a transcript case and privately mapped ownership on deletion', async () => {
      await role('authenticated', owner);
      await db.query('select public.begin_delete($1)', [id]);
      await role('anon');
      expect(
        (await db.query('select * from public.cases where id=$1', [id])).rows,
      ).toEqual([]);
      await role('authenticated', owner);
      await db.query('select public.finish_delete($1)', [id]);
      await role(userInfo().username);
      expect(
        (
          await db.query('select * from private.case_owners where case_id=$1', [
            id,
          ])
        ).rows,
      ).toEqual([]);
    });
    it('requires historical storage cleanup before deleting screenshots and records', async () => {
      await role('authenticated', owner);
      await db.query('select public.begin_delete($1)', [legacy]);
      await denied('select public.finish_delete($1)', [legacy]);
      await db.query('delete from storage.objects where name=$1', [path]);
      await db.query('select public.finish_delete($1)', [legacy]);
      await role(userInfo().username);
      expect(
        (
          await db.query('select * from private.uploads where case_id=$1', [
            legacy,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            'select * from public.case_screenshots where case_id=$1',
            [legacy],
          )
        ).rows,
      ).toEqual([]);
    });
    it('restricts the password rejection hook to Auth administration without logging out OTP sessions', async () => {
      await role('anon');
      await denied("select public.reject_password_login('{}')");
      await role('authenticated', owner);
      await denied("select public.reject_password_login('{}')");
      await role('supabase_auth_admin');
      expect(
        (
          await db.query(
            'select public.reject_password_login(\'{"valid":true}\') as result',
          )
        ).rows[0].result,
      ).toMatchObject({ decision: 'reject', should_logout_user: false });
    });
  },
);
