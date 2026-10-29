import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
const enabled =
  !!process.env.TEST_SUPABASE_URL &&
  !!process.env.TEST_SUPABASE_PUBLISHABLE_KEY &&
  !!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
describe.skipIf(!enabled)(
  'isolated real Supabase: OTP, direct PostgREST and Storage requests',
  () => {
    let admin: SupabaseClient,
      owner: SupabaseClient,
      other: SupabaseClient,
      anonymous: SupabaseClient;
    const id = randomUUID(),
      users: { id: string; email: string; password: string }[] = [];
    const transcript = [
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'Hello. What would you like to talk about?' },
    ];
    const save = (
      db: SupabaseClient,
      version = 1,
      extra: Record<string, unknown> = {},
    ) =>
      db.rpc('save_case', {
        p_id: id,
        p_version: version,
        p_constitution: 1,
        p_description: 'Isolated integration fixture',
        p_improvement: 'Explain reasoning',
        p_transcript: transcript,
        p_behavior: 'bad',
        ...extra,
      });
    beforeAll(async () => {
      const url = process.env.TEST_SUPABASE_URL!;
      if (
        !['127.0.0.1', 'localhost'].includes(new URL(url).hostname) &&
        process.env.TEST_ISOLATED_PROJECT !== '1'
      )
        throw new Error(
          'Use an explicitly isolated test project, never citizen data.',
        );
      const options = {
        auth: { persistSession: false, autoRefreshToken: false },
      };
      admin = createClient(
        url,
        process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!,
        options,
      );
      const client = () =>
        createClient(url, process.env.TEST_SUPABASE_PUBLISHABLE_KEY!, options);
      anonymous = client();
      owner = client();
      other = client();
      for (const db of [owner, other]) {
        const email = 'fixture-' + randomUUID() + '@example.test',
          password = 'Fixture-' + randomUUID();
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        expect(created.error).toBeNull();
        users.push({ id: created.data.user!.id, email, password });
        const link = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
        });
        expect(link.error).toBeNull();
        const verified = await db.auth.verifyOtp({
          email,
          token: link.data.properties!.email_otp,
          type: 'email',
        });
        expect(verified.error).toBeNull();
        expect(verified.data.user?.id).toBe(created.data.user!.id);
      }
    });
    afterAll(async () => {
      if (owner) {
        const { data } = await owner.rpc('begin_delete', { p_id: id });
        if (data?.length) await owner.storage.from('screenshots').remove(data);
        await owner.rpc('finish_delete', { p_id: id });
      }
      if (admin)
        for (const user of users) await admin.auth.admin.deleteUser(user.id);
    });
    it('rejects direct old-password login when the configured hook is active, while OTP preserves identity', async () => {
      const db = createClient(
        process.env.TEST_SUPABASE_URL!,
        process.env.TEST_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      // A failure here explicitly means hosted password rejection has not been configured.
      expect(
        (
          await db.auth.signInWithPassword({
            email: users[0].email,
            password: users[0].password,
          })
        ).error,
      ).not.toBeNull();
      expect((await owner.auth.getUser()).data.user?.id).toBe(users[0].id);
    });
    it('enforces atomic creation, required evidence/classification and public anonymity', async () => {
      expect((await save(anonymous)).error).not.toBeNull();
      expect(
        (await save(owner, 1, { p_transcript: null })).error,
      ).not.toBeNull();
      expect((await save(owner, 1, { p_behavior: null })).error).not.toBeNull();
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
      expect((await save(owner)).error).toBeNull();
      expect((await save(owner)).error).toBeNull();
      const result = await anonymous.from('cases').select('*').eq('id', id);
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatchObject({ transcript, behavior: 'bad' });
      expect(JSON.stringify(result.data)).not.toMatch(
        /user_id|owner_id|@example.test/,
      );
      for (const user of users)
        expect(JSON.stringify(result.data)).not.toContain(user.id);
      expect(
        (await anonymous.schema('private').from('case_owners').select('*'))
          .error,
      ).not.toBeNull();
    });
    it('rejects other-owner mutations, immutable transcript replacement and new screenshot writes', async () => {
      expect((await save(other, 2)).error).not.toBeNull();
      expect(
        (await other.rpc('begin_delete', { p_id: id })).error,
      ).not.toBeNull();
      expect(
        (
          await save(owner, 2, {
            p_transcript: [
              { role: 'user', text: 'changed' },
              { role: 'assistant', text: 'changed' },
            ],
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.rpc('reserve_upload', {
            p_case: id,
            p_mime: 'image/png',
            p_size: 68,
          })
        ).error,
      ).not.toBeNull();
      expect(
        (await other.from('case_screenshots').delete().eq('case_id', id)).error,
      ).not.toBeNull();
      expect(
        (
          await other.storage
            .from('screenshots')
            .upload(
              id + '/' + randomUUID() + '.png',
              new Uint8Array([1, 2, 3]),
              { contentType: 'image/png' },
            )
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
    });
    it('persists owner edits/classification and deletes the case completely', async () => {
      expect(
        (
          await save(owner, 2, {
            p_behavior: 'good',
            p_description: 'Updated integration fixture',
          })
        ).error,
      ).toBeNull();
      expect(
        (await anonymous.from('cases').select('behavior').eq('id', id).single())
          .data?.behavior,
      ).toBe('good');
      expect((await owner.rpc('begin_delete', { p_id: id })).error).toBeNull();
      expect(
        (await anonymous.from('cases').select('*').eq('id', id)).data,
      ).toEqual([]);
      expect((await owner.rpc('finish_delete', { p_id: id })).error).toBeNull();
    });
  },
);
