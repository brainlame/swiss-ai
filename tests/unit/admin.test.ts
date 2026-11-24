import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/routes/api/issues/[id]/delete/+server';
const id = 'aaaaaaaa-0000-4000-8000-000000000001';
function event(admin = false, user = true, origin = 'https://app.test') {
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'is_admin' ? admin : name === 'begin_delete' ? [] : null,
    error: null,
  }));
  return {
    rpc,
    value: {
      locals: {
        user: user ? { id: 'private', user_metadata: { admin: true } } : null,
        supabase: { rpc },
      },
      params: { id },
      url: new URL('https://app.test/api/issues/' + id + '/delete'),
      request: new Request('https://app.test/api/issues/' + id + '/delete', {
        method: 'POST',
        headers: { origin },
      }),
    } as unknown as Parameters<typeof POST>[0],
  };
}
describe('admin deletion server boundaries', () => {
  it('denies signed-out users and ignores user-editable admin claims', async () => {
    const anonymous = event(false, false);
    await expect(POST(anonymous.value)).rejects.toMatchObject({ status: 401 });
    expect(anonymous.rpc).not.toHaveBeenCalled();
    const regular = event(false);
    await expect(POST(regular.value)).rejects.toMatchObject({ status: 403 });
    expect(regular.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects forged origins before starting deletion', async () => {
    const forged = event(true, true, 'https://foreign.test');
    await expect(POST(forged.value)).rejects.toMatchObject({ status: 403 });
    expect(forged.rpc).toHaveBeenCalledTimes(1);
  });
  it('uses guarded RPCs and verifies membership on each new request', async () => {
    const admin = event(true);
    expect(await (await POST(admin.value)).json()).toEqual({ deleted: true });
    expect(admin.rpc.mock.calls.map((args) => args[0])).toEqual([
      'is_admin',
      'begin_delete',
      'finish_delete',
    ]);
    const revoked = event(false);
    await expect(POST(revoked.value)).rejects.toMatchObject({ status: 403 });
    expect(revoked.rpc.mock.calls.map((args) => args[0])).toEqual(['is_admin']);
  });
  it('reports verification failures and deletion failures instead of success', async () => {
    const unavailable = event(true);
    unavailable.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'unavailable' },
    } as never);
    await expect(POST(unavailable.value)).rejects.toMatchObject({
      status: 503,
    });
    const denied = event(true);
    denied.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501' } } as never);
    const response = await POST(denied.value);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('deleted');
  });
});
