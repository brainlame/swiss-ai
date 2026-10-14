import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
const enabled = !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)(
  'isolated PostgreSQL: real migrations, RPCs, grants and RLS',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const owner = randomUUID(),
      other = randomUUID(),
      caseId = randomUUID();
    let path: string, newPath: string;
    async function role(name: string, user = '') {
      await db.query('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user,
      ]);
      await db.query(`set role ${name}`);
    }
    async function denied(query: string, args: unknown[] = []) {
      await db.query('savepoint rejection');
      await expect(db.query(query, args)).rejects.toThrow();
      await db.query('rollback to savepoint rejection');
    }
    beforeAll(async () => {
      await db.connect();
      await db.query('begin');
      await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
        owner,
        'owner@test.invalid',
        other,
        'other@test.invalid',
      ]);
    });
    afterAll(async () => {
      await db.query('reset role');
      await db.query('rollback');
      await db.end();
    });
    it('provides exactly 11 samples and forbids public writes and creation', async () => {
      await role('anon');
      expect(
        (await db.query('select * from public.constitutions')).rows,
      ).toHaveLength(11);
      await denied(
        "update public.constitutions set text='forged' where number=1",
      );
      await denied(
        "select public.begin_case($1,1::smallint,'description','proposal')",
        [caseId],
      );
      await denied('select * from private.case_owners');
      await denied('select * from private.uploads');
    });
    it('rejects whitespace-only text and invalid screenshots through direct RPCs', async () => {
      await role('authenticated', owner);
      await denied("select public.begin_case($1,1::smallint,$2,'proposal')", [
        randomUUID(),
        '\t\n',
      ]);
      await denied("select public.begin_case($1,1::smallint,$2,'proposal')", [
        randomUUID(),
        '\u00a0\u2003',
      ]);
      await denied(
        "select public.begin_case($1,12::smallint,'description','proposal')",
        [randomUUID()],
      );
    });
    it('binds a private draft to auth.uid and rejects unfinished publication', async () => {
      await role('authenticated', owner);
      await db.query(
        "select public.begin_case($1,5::smallint,'A safety example','Prohibit unsafe access')",
        [caseId],
      );
      await denied(
        "select public.commit_case($1,1,5::smallint,'description','proposal',array[]::text[])",
        [caseId],
      );
      path = (
        await db.query("select public.reserve_upload($1,'image/png',68)", [
          caseId,
        ])
      ).rows[0].reserve_upload;
      expect(path).not.toContain(owner);
      expect(path).not.toContain('email');
      await denied(
        "select public.commit_case($1,1,5::smallint,'description','proposal',array[$2])",
        [caseId, path],
      );
      await role('anon');
      expect(
        (await db.query('select * from public.cases where id=$1', [caseId]))
          .rows,
      ).toHaveLength(0);
      await denied('select public.browse_cases(p_mine=>true)');
    });
    it('enforces another user’s case and storage mutation permissions directly', async () => {
      await role('authenticated', other);
      await denied(
        "select public.begin_case($1,5::smallint,'forged','forged')",
        [caseId],
      );
      await denied("select public.reserve_upload($1,'image/png',68)", [caseId]);
      await denied('select public.begin_delete($1)', [caseId]);
      await denied(
        "insert into storage.objects(bucket_id,name,metadata) values('screenshots',$1,'{}')",
        [path],
      );
      expect(
        (await db.query('select public.can_read_image($1) as allowed', [path]))
          .rows[0].allowed,
      ).toBe(false);
      await denied("update public.cases set description='forged' where id=$1", [
        caseId,
      ]);
      await denied(
        'insert into private.case_owners(case_id,user_id) values($1,$2)',
        [caseId, other],
      );
    });
    it('allows an owner to upload and complete a case; public responses contain no identity', async () => {
      await role('authenticated', owner);
      await db.query(
        'insert into storage.objects(bucket_id,name,metadata) values(\'screenshots\',$1,\'{"size":68,"mimetype":"image/png"}\')',
        [path],
      );
      await db.query(
        "select public.commit_case($1,1,5::smallint,'A safety example','Prohibit unsafe access',array[$2])",
        [caseId, path],
      );
      await role('anon');
      const rows = (await db.query('select * from public.browse_cases()')).rows;
      expect(rows.some((r) => r.id === caseId)).toBe(true);
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain(owner);
      expect(serialized).not.toContain('owner@test.invalid');
      expect(serialized).not.toMatch(/user_id|owner_id|email/);
      expect(
        (await db.query('select * from storage.objects where name=$1', [path]))
          .rows,
      ).toHaveLength(1);
    });
    it('rejects mutation of committed evidence and wrong-version edits, but supports atomic owner edits', async () => {
      await role('authenticated', other);
      await denied(
        "select public.commit_case($1,2,1::smallint,'forged','forged',array[$2])",
        [caseId, path],
      );
      expect(
        (
          await db.query(
            'delete from storage.objects where name=$1 returning *',
            [path],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "update storage.objects set metadata='{}' where name=$1 returning *",
            [path],
          )
        ).rows,
      ).toHaveLength(0);
      await role('authenticated', owner);
      expect(
        (
          await db.query(
            'delete from storage.objects where name=$1 returning *',
            [path],
          )
        ).rows,
      ).toHaveLength(0);
      await denied(
        "select public.commit_case($1,1,1::smallint,'new','new',array[$2])",
        [caseId, path],
      );
      await denied(
        "select public.commit_case($1,2,12::smallint,'new','new',array[$2])",
        [caseId, path],
      );
      await denied(
        "select public.commit_case($1,2,1::smallint,'  ','new',array[$2])",
        [caseId, path],
      );
      newPath = (
        await db.query("select public.reserve_upload($1,'image/webp',100)", [
          caseId,
        ])
      ).rows[0].reserve_upload;
      await db.query(
        'insert into storage.objects(bucket_id,name,metadata) values(\'screenshots\',$1,\'{"size":100,"mimetype":"image/webp"}\')',
        [newPath],
      );
      await db.query(
        "select public.commit_case($1,2,2::smallint,'An honest example','Describe uncertainty clearly',array[$2])",
        [caseId, newPath],
      );
      await db.query(
        "select public.commit_case($1,2,2::smallint,'An honest example','Describe uncertainty clearly',array[$2])",
        [caseId, newPath],
      );
      expect(
        (await db.query('select * from public.cases where id=$1', [caseId]))
          .rows[0],
      ).toMatchObject({
        constitution_number: 2,
        version: 3,
        description: 'An honest example',
      });
      expect(
        (
          await db.query(
            'delete from storage.objects where name=$1 returning *',
            [path],
          )
        ).rows,
      ).toHaveLength(1);
      await db.query('select public.prune_uploads($1)', [caseId]);
    });
    it('searches both fields, filters, orders and paginates tied timestamps in SQL', async () => {
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
      const filtered = (
        await db.query(
          "select * from public.browse_cases(p_search=>'pagination',p_constitution=>2)",
        )
      ).rows;
      expect(filtered.every((r) => r.constitution_number === 2)).toBe(true);
      expect(
        (
          await db.query(
            "select * from public.browse_cases(p_search=>'unique-proposal')",
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (await db.query("select * from public.browse_cases(p_search=>'%')"))
          .rows,
      ).toHaveLength(0);
      await role('authenticated', owner);
      expect(
        (await db.query('select * from public.browse_cases(p_mine=>true)'))
          .rows,
      ).toHaveLength(1);
    });
    it('hides a deleting case immediately and requires storage cleanup before final deletion', async () => {
      await role('authenticated', owner);
      await db.query('select public.begin_delete($1)', [caseId]);
      await denied('select public.finish_delete($1)', [caseId]);
      await role('anon');
      expect(
        (await db.query('select * from public.cases where id=$1', [caseId]))
          .rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query('select * from storage.objects where name=$1', [
            newPath,
          ])
        ).rows,
      ).toHaveLength(0);
      await role('authenticated', owner);
      expect(
        (
          await db.query(
            'delete from storage.objects where name=$1 returning *',
            [newPath],
          )
        ).rows,
      ).toHaveLength(1);
      await db.query('select public.finish_delete($1)', [caseId]);
      expect(
        (await db.query('select * from public.cases where id=$1', [caseId]))
          .rows,
      ).toHaveLength(0);
      await role(userInfo().username);
      expect(
        (
          await db.query('select * from private.case_owners where case_id=$1', [
            caseId,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query('select * from private.uploads where case_id=$1', [
            caseId,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            'select * from public.case_screenshots where case_id=$1',
            [caseId],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it('claims abandoned evidence before cleanup and forbids republishing it', async () => {
      const abandoned = randomUUID();
      await role('authenticated', owner);
      await db.query(
        "select public.begin_case($1,1::smallint,'abandoned fixture','proposal')",
        [abandoned],
      );
      const pending = (
        await db.query("select public.reserve_upload($1,'image/png',68)", [
          abandoned,
        ])
      ).rows[0].reserve_upload;
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('screenshots',$1,$2)",
        [pending, JSON.stringify({ size: 68, mimetype: 'image/png' })],
      );
      await role(userInfo().username);
      await db.query(
        "update private.uploads set created_at=now()-interval '25 hours' where case_id=$1",
        [abandoned],
      );
      await role('service_role');
      expect(
        (await db.query('select * from public.cleanup_candidates()')).rows.map(
          (r) => r.cleanup_candidates,
        ),
      ).toContain(pending);
      await role('authenticated', owner);
      await denied(
        "select public.commit_case($1,1,1::smallint,'abandoned fixture','proposal',array[$2])",
        [abandoned, pending],
      );
      await db.query('delete from storage.objects where name=$1', [pending]);
      await role('service_role');
      await db.query('select public.finish_cleanup()');
      await role(userInfo().username);
      expect(
        (
          await db.query('select * from private.uploads where path=$1', [
            pending,
          ])
        ).rows,
      ).toHaveLength(0);
    });
  },
);
