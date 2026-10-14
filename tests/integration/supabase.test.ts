import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
const enabled =
  !!process.env.TEST_SUPABASE_URL &&
  !!process.env.TEST_SUPABASE_PUBLISHABLE_KEY &&
  !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
describe.skipIf(!enabled)(
  'isolated real Supabase: direct Auth/PostgREST/Storage requests',
  () => {
    let admin: SupabaseClient,
      owner: SupabaseClient,
      other: SupabaseClient,
      anonymous: SupabaseClient;
    const id = randomUUID();
    let path: string;
    const userIds: string[] = [];
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    );
    beforeAll(async () => {
      const url = process.env.TEST_SUPABASE_URL!;
      if (
        !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) &&
        process.env.TEST_ISOLATED_PROJECT !== '1'
      )
        throw new Error(
          'Use a local or explicitly isolated test project. Never run on citizen submissions.',
        );
      const options = {
        auth: { persistSession: false, autoRefreshToken: false },
      };
      admin = createClient(
        url,
        process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
        options,
      );
      anonymous = createClient(
        url,
        process.env.TEST_SUPABASE_PUBLISHABLE_KEY!,
        options,
      );
      owner = createClient(
        url,
        process.env.TEST_SUPABASE_PUBLISHABLE_KEY!,
        options,
      );
      other = createClient(
        url,
        process.env.TEST_SUPABASE_PUBLISHABLE_KEY!,
        options,
      );
      for (const db of [owner, other]) {
        const email = 'fixture-' + randomUUID() + '@example.test',
          password = 'Fixture-' + randomUUID();
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        expect(error).toBeNull();
        userIds.push(data.user!.id);
        expect(
          (await db.auth.signInWithPassword({ email, password })).error,
        ).toBeNull();
      }
    });
    afterAll(async () => {
      if (owner) {
        const { data } = await owner.rpc('begin_delete', { p_id: id });
        if (data?.length) await owner.storage.from('screenshots').remove(data);
        await owner.rpc('finish_delete', { p_id: id });
      }
      if (admin)
        for (const uid of userIds) await admin.auth.admin.deleteUser(uid);
    });
    it('rejects unauthenticated writes and constitution mutation; owns drafts privately', async () => {
      expect(
        (
          await anonymous.rpc('begin_case', {
            p_id: id,
            p_constitution: 1,
            p_description: 'fixture',
            p_improvement: 'fixture',
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner
            .from('constitutions')
            .update({ text: 'forged' })
            .eq('number', 1)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.from('cases').insert({
            id,
            constitution_number: 1,
            description: 'forged',
            improvement: 'forged',
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.rpc('begin_case', {
            p_id: id,
            p_constitution: 1,
            p_description: 'Isolated integration fixture',
            p_improvement: 'Explain reasoning',
          })
        ).error,
      ).toBeNull();
      expect(
        (await anonymous.from('cases').select('*').eq('id', id)).data,
      ).toEqual([]);
      expect(
        (
          await other.rpc('reserve_upload', {
            p_case: id,
            p_mime: 'image/png',
            p_size: png.length,
          })
        ).error,
      ).not.toBeNull();
      const reserved = await owner.rpc('reserve_upload', {
        p_case: id,
        p_mime: 'image/png',
        p_size: png.length,
      });
      expect(reserved.error).toBeNull();
      path = reserved.data;
      expect(userIds.every((uid) => !path.includes(uid))).toBe(true);
    });
    it('enforces real Storage bucket types, size, private drafts, and immutable ownership', async () => {
      expect(
        (
          await other.storage
            .from('screenshots')
            .upload(path, png, { contentType: 'image/png' })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.storage
            .from('screenshots')
            .upload(path, png, { contentType: 'image/png' })
        ).error,
      ).toBeNull();
      expect(
        (await anonymous.storage.from('screenshots').createSignedUrl(path, 60))
          .error,
      ).not.toBeNull();
      const oversized = await owner.rpc('reserve_upload', {
        p_case: id,
        p_mime: 'image/png',
        p_size: 10485760,
      });
      expect(oversized.error).toBeNull();
      expect(
        (
          await owner.storage
            .from('screenshots')
            .upload(oversized.data, new Uint8Array(10485761), {
              contentType: 'image/png',
            })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.rpc('reserve_upload', {
            p_case: id,
            p_mime: 'image/svg+xml',
            p_size: 20,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await other.storage
            .from('screenshots')
            .upload(path, png, { contentType: 'image/png', upsert: true })
        ).error,
      ).not.toBeNull();
      await other.storage.from('screenshots').remove([path]);
      expect(
        (await owner.storage.from('screenshots').download(path)).error,
      ).toBeNull();
    });
    it('publishes only complete evidence and exposes no author identity through public APIs', async () => {
      expect(
        (
          await owner.rpc('commit_case', {
            p_id: id,
            p_version: 1,
            p_constitution: 1,
            p_description: 'Isolated integration fixture',
            p_improvement: 'Explain reasoning',
            p_paths: [path],
          })
        ).error,
      ).toBeNull();
      const response = await anonymous.from('cases').select('*').eq('id', id);
      expect(response.error).toBeNull();
      expect(response.data).toHaveLength(1);
      expect(Object.keys(response.data![0])).not.toEqual(
        expect.arrayContaining(['owner_id', 'user_id', 'email']),
      );
      for (const uid of userIds)
        expect(JSON.stringify(response.data)).not.toContain(uid);
      expect(
        (await anonymous.storage.from('screenshots').createSignedUrl(path, 60))
          .error,
      ).toBeNull();
      expect(
        (await anonymous.schema('private').from('case_owners').select('*'))
          .error,
      ).not.toBeNull();
      expect(
        (await anonymous.rpc('pending_paths', { p_case: id })).error,
      ).not.toBeNull();
    });
    it('rejects the second account’s case/evidence mutations and allows owner editing and full deletion', async () => {
      expect(
        (
          await other.rpc('commit_case', {
            p_id: id,
            p_version: 2,
            p_constitution: 2,
            p_description: 'forged',
            p_improvement: 'forged',
            p_paths: [path],
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await other.rpc('begin_delete', { p_id: id })).error,
      ).not.toBeNull();
      expect(
        (await other.from('case_screenshots').delete().eq('case_id', id)).error,
      ).not.toBeNull();
      expect(
        (
          await owner.rpc('commit_case', {
            p_id: id,
            p_version: 2,
            p_constitution: 2,
            p_description: 'Updated integration fixture',
            p_improvement: 'Explain uncertainty',
            p_paths: [path],
          })
        ).error,
      ).toBeNull();
      expect((await owner.rpc('begin_delete', { p_id: id })).error).toBeNull();
      expect(
        (await anonymous.from('cases').select('*').eq('id', id)).data,
      ).toEqual([]);
      expect(
        (await owner.rpc('finish_delete', { p_id: id })).error,
      ).not.toBeNull();
      expect(
        (await owner.storage.from('screenshots').remove([path])).error,
      ).toBeNull();
      expect((await owner.rpc('finish_delete', { p_id: id })).error).toBeNull();
      expect(
        (await anonymous.from('case_screenshots').select('*').eq('case_id', id))
          .data,
      ).toEqual([]);
      expect(
        (await anonymous.storage.from('screenshots').download(path)).error,
      ).not.toBeNull();
    });
  },
);
