import { describe, it, expect, vi, beforeEach } from 'vitest';
const deps = vi.hoisted(() => ({
  client: vi.fn(),
  remove: vi.fn(),
  release: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock('$app/env/private', () => ({
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-key',
}));
vi.mock('$app/env/public', () => ({
  PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: deps.client }));
import { actions, load } from '../../src/routes/settings/+page.server';
function event(confirmation = '', signedIn = true) {
  const body = new FormData();
  body.set('confirmation', confirmation);
  body.set('user_id', 'forged-other-user');
  return {
    locals: {
      user: signedIn ? { id: 'current-user' } : null,
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: ['random.png'], error: null }),
        auth: { signOut: vi.fn() },
      },
    },
    url: new URL('https://fixture.invalid/settings'),
    request: new Request('https://fixture.invalid/settings', {
      method: 'POST',
      body,
    }),
  } as any;
}
beforeEach(() => {
  for (const mock of Object.values(deps)) mock.mockReset();
  deps.remove.mockResolvedValue({ error: null });
  deps.release.mockResolvedValue({ error: null });
  deps.deleteUser.mockResolvedValue({ error: null });
  deps.client.mockReturnValue({
    storage: { from: () => ({ remove: deps.remove }) },
    rpc: deps.release,
    auth: { admin: { deleteUser: deps.deleteUser } },
  });
});
describe('account deletion boundaries', () => {
  it('requires sign-in and explicit confirmation before using privileged credentials', async () => {
    await expect((load as any)(event('', false))).rejects.toMatchObject({
      status: 303,
    });
    const result = await actions.delete!(event(''));
    expect(result).toMatchObject({ status: 400 });
    expect(deps.client).not.toHaveBeenCalled();
  });
  it('deletes only the verified current account and signs out after successful deletion', async () => {
    const e = event('DELETE');
    await expect(actions.delete!(e)).rejects.toMatchObject({
      status: 303,
      location: '/signin?accountDeleted=1',
    });
    expect(deps.deleteUser).toHaveBeenCalledWith('current-user');
    expect(deps.release).toHaveBeenCalledWith('release_account_storage', {
      p_user: 'current-user',
    });
    expect(e.locals.supabase.auth.signOut).toHaveBeenCalledOnce();
  });
  it('does not delete the account when picture cleanup fails', async () => {
    deps.remove.mockResolvedValue({ error: { message: 'fixture failure' } });
    expect(await actions.delete!(event('DELETE'))).toMatchObject({
      status: 503,
    });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });
});
