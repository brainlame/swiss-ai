import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { authAction, emailChallenge } from '../../src/lib/server/auth';
import { requireUser } from '../../src/lib/server/data';
import { POST as save } from '../../src/routes/api/save/+server';
import { load as chatbot } from '../../src/routes/chatbot/+page.server';
function event(fields: Record<string, string> = {}, challenge: unknown = null) {
  const data = new FormData();
  Object.entries(fields).forEach(([k, v]) => data.set(k, v));
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'fixture' } },
      error: null,
    }),
  };
  return {
    url: new URL('https://app.example/chatbot'),
    request: { formData: async () => data },
    cookies: {
      get: vi.fn(() => (challenge ? JSON.stringify(challenge) : undefined)),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: { user: null, supabase: { auth } },
  } as unknown as RequestEvent;
}
describe('email code authentication and access', () => {
  it('protects Chatbot, My Cases and saves with verified account requirements', async () => {
    for (const path of ['/chatbot', '/my-cases', '/submit?source=chatbot']) {
      const e = { ...event(), url: new URL('https://app.example' + path) };
      expect(() => requireUser(e)).toThrow(
        expect.objectContaining({
          status: 303,
          location: '/signin?next=' + encodeURIComponent(path),
        }),
      );
    }
    const e = event();
    expect(() => chatbot(e as Parameters<typeof chatbot>[0])).toThrow();
    await expect(save(e as Parameters<typeof save>[0])).rejects.toMatchObject({
      status: 401,
    });
  });
  it('uses one OTP flow for new and existing emails without changing identities', async () => {
    const e = event({ email: '  Citizen@example.test ' });
    expect(await authAction(e, 'send')).toMatchObject({
      step: 'verify',
      email: 'citizen@example.test',
    });
    expect(e.locals.supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'citizen@example.test',
      options: { shouldCreateUser: true },
    });
    expect(e.cookies.set).toHaveBeenCalledWith(
      'email-code-challenge',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });
  it('verifies a pasted code with a leading zero and validates return destinations', async () => {
    const e = event({
      email: 'citizen@example.test',
      token: ' 012345 ',
      next: '//evil.test',
    });
    await expect(authAction(e, 'verify')).rejects.toMatchObject({
      status: 303,
      location: '/chatbot',
    });
    expect(e.locals.supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'citizen@example.test',
      token: '012345',
      type: 'email',
    });
    expect(e.cookies.delete).toHaveBeenCalled();
  });
  it('rejects invalid codes and preserves the email for expired-code retries', async () => {
    for (const token of ['12345', '1234567', 'abcdef', '']) {
      const e = event({ email: 'citizen@example.test', token });
      expect(await authAction(e, 'verify')).toMatchObject({
        status: 400,
        data: { step: 'verify' },
      });
      expect(e.locals.supabase.auth.verifyOtp).not.toHaveBeenCalled();
    }
    const e = event({ email: 'citizen@example.test', token: '999999' });
    vi.mocked(e.locals.supabase.auth.verifyOtp).mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { status: 403 } as never,
    });
    expect(await authAction(e, 'verify')).toMatchObject({
      data: {
        email: 'citizen@example.test',
        message: expect.stringContaining('expired'),
      },
    });
  });
  it('enforces app resend cooldown, supports changing email and handles delivery failures', async () => {
    const e = event(
      { email: 'citizen@example.test' },
      { email: 'citizen@example.test', resendAt: Date.now() + 60000 },
    );
    expect(await authAction(e, 'send')).toMatchObject({ status: 429 });
    expect(e.locals.supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(await authAction(e, 'change')).toMatchObject({
      step: 'email',
      email: '',
    });
    expect(e.cookies.delete).toHaveBeenCalled();
    const failed = event({ email: 'citizen@example.test' });
    vi.mocked(failed.locals.supabase.auth.signInWithOtp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { status: 500 } as never,
    });
    expect(await authAction(failed, 'send')).toMatchObject({
      status: 400,
      data: { message: expect.stringContaining('could not send') },
    });
    expect(
      emailChallenge({ cookies: { get: () => '{invalid' } } as never),
    ).toBeNull();
  });
});
