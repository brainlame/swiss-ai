import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { authAction } from '../../src/lib/server/auth';
import { requireUser } from '../../src/lib/server/data';
import { GET as confirm } from '../../src/routes/auth/confirm/+server';
import { GET as callback } from '../../src/routes/auth/callback/+server';
import { POST as save } from '../../src/routes/api/save/+server';
import { POST as upload } from '../../src/routes/api/uploads/+server';
function event(fields: Record<string, string> = {}, user: unknown = null) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    url: new URL('https://app.example/submit?constitution=5'),
    request: { formData: async () => data },
    locals: { user, supabase: { auth } },
  } as unknown as Omit<RequestEvent, 'url'> & { url: URL };
}
describe('verified-account gates and authentication flows', () => {
  it('redirects submission and My Cases to signin with the full intended destination', () => {
    for (const path of ['/submit?constitution=5', '/my-cases']) {
      const e = event();
      e.url = new URL('https://app.example' + path);
      expect(() => requireUser(e)).toThrow();
      try {
        requireUser(e);
      } catch (r) {
        expect(r).toMatchObject({
          status: 303,
          location: '/signin?next=' + encodeURIComponent(path),
        });
      }
    }
  });
  it('rejects protected JSON/file operations before any mutation', async () => {
    const e = event();
    await expect(save(e as Parameters<typeof save>[0])).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      upload(e as Parameters<typeof upload>[0]),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('signs in and validates return destinations', async () => {
    const e = event({
      email: 'citizen@example.test',
      password: 'password123',
      next: '//evil.example',
    });
    await expect(authAction(e, 'signin')).rejects.toMatchObject({
      status: 303,
      location: '/submit',
    });
    expect(e.locals.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'citizen@example.test',
      password: 'password123',
    });
  });
  it('supports email-confirmation signup and recovers actionable signup errors', async () => {
    const e = event({
      email: 'citizen@example.test',
      password: 'password123',
      next: '/my-cases',
    });
    expect(await authAction(e, 'signup')).toMatchObject({
      success: true,
      message: expect.stringContaining('confirm'),
    });
    vi.mocked(e.locals.supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'fixture failure' } as never,
    });
    expect(await authAction(e, 'signup')).toMatchObject({
      status: 400,
      data: { message: expect.stringContaining('Signup failed') },
    });
  });
  it('sends generic recovery success and updates the verified user’s password', async () => {
    const e = event({ email: 'citizen@example.test' });
    expect(await authAction(e, 'forgot-password')).toMatchObject({
      success: true,
      message: expect.stringContaining('If an account exists'),
    });
    expect(e.locals.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'citizen@example.test',
      { redirectTo: 'https://app.example/auth/callback?next=/reset-password' },
    );
    const reset = event({ password: 'newpassword123' }, { id: 'fixture' });
    await expect(authAction(reset, 'reset-password')).rejects.toMatchObject({
      status: 303,
      location: '/my-cases?password=updated',
    });
    expect(reset.locals.supabase.auth.updateUser).toHaveBeenCalledWith({
      password: 'newpassword123',
    });
    await expect(
      authAction(event({ password: 'newpassword123' }), 'reset-password'),
    ).rejects.toMatchObject({ location: '/forgot-password' });
  });
  it('verifies token hashes for confirmation/recovery and exchanges PKCE callback codes', async () => {
    const e = event();
    e.url = new URL(
      'https://app.example/auth/confirm?token_hash=fixture&type=recovery',
    );
    await expect(
      confirm(e as Parameters<typeof confirm>[0]),
    ).rejects.toMatchObject({ location: '/reset-password' });
    expect(e.locals.supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'fixture',
      type: 'recovery',
    });
    e.url = new URL(
      'https://app.example/auth/callback?code=fixture&next=/my-cases',
    );
    await expect(
      callback(e as Parameters<typeof callback>[0]),
    ).rejects.toMatchObject({ location: '/my-cases' });
    expect(e.locals.supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'fixture',
    );
  });
  it('rejects expired, missing and unsupported confirmation links', async () => {
    const e = event();
    e.url = new URL(
      'https://app.example/auth/confirm?token_hash=fixture&type=unsupported',
    );
    await expect(
      confirm(e as Parameters<typeof confirm>[0]),
    ).rejects.toMatchObject({ location: '/signin?authError=1' });
    expect(e.locals.supabase.auth.verifyOtp).not.toHaveBeenCalled();
    e.url = new URL('https://app.example/auth/callback');
    await expect(
      callback(e as Parameters<typeof callback>[0]),
    ).rejects.toMatchObject({ location: '/signin?authError=1' });
  });
});
