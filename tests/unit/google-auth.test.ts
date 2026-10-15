import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/routes/auth/google/+server';
import { GET as callback } from '../../src/routes/auth/callback/+server';

vi.mock('$app/env/public', () => ({
  PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
}));

function start(next = '/chatbot', origin = 'https://app.example') {
  const signInWithOAuth = vi.fn().mockResolvedValue({
    data: {
      provider: 'google',
      url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    },
    error: null,
  });
  const exchangeCodeForSession = vi
    .fn()
    .mockResolvedValue({ data: {}, error: null });
  const body = new URLSearchParams({ next });
  return {
    event: {
      url: new URL('https://app.example/auth/google'),
      request: new Request('https://app.example/auth/google', {
        method: 'POST',
        headers: { origin },
        body,
      }),
      locals: {
        supabase: { auth: { signInWithOAuth, exchangeCodeForSession } },
      },
    } as unknown as Parameters<typeof POST>[0],
    signInWithOAuth,
    exchangeCodeForSession,
  };
}
describe('Google OAuth server flow', () => {
  it('starts Google PKCE through the SSR client with a same-origin callback and intended destination', async () => {
    const { event, signInWithOAuth } = start('/submit?constitution=5');
    await expect(POST(event)).rejects.toMatchObject({
      status: 303,
      location: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    });
    const credentials = signInWithOAuth.mock.calls[0][0];
    expect(credentials.provider).toBe('google');
    const url = new URL(credentials.options.redirectTo);
    expect(url.origin + url.pathname).toBe('https://app.example/auth/callback');
    expect(url.searchParams.get('next')).toBe('/submit?constitution=5');
    expect(url.searchParams.get('provider')).toBe('google');
    expect(credentials.options.skipBrowserRedirect).toBeUndefined();
  });
  it('rejects foreign origins before creating PKCE state', async () => {
    const { event, signInWithOAuth } = start(
      '/chatbot',
      'https://evil.example',
    );
    await expect(POST(event)).rejects.toMatchObject({ status: 403 });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
  it('rejects unsafe return destinations on both initiation and callback', async () => {
    for (const next of [
      '//evil.example',
      'https://evil.example',
      '/%5cevil.example',
    ]) {
      const { event, signInWithOAuth } = start(next);
      await expect(POST(event)).rejects.toMatchObject({ status: 303 });
      expect(
        new URL(
          signInWithOAuth.mock.calls[0][0].options.redirectTo,
        ).searchParams.get('next'),
      ).toBe('/submit');
      const callbackEvent = {
        ...event,
        url: new URL(
          'https://app.example/auth/callback?code=fixture&next=' +
            encodeURIComponent(next),
        ),
      };
      await expect(
        callback(callbackEvent as unknown as Parameters<typeof callback>[0]),
      ).rejects.toMatchObject({ location: '/submit' });
    }
  });
  it('keeps the intended destination and shows a generic error when initiation fails', async () => {
    for (const result of [
      { data: { url: null }, error: new Error('private provider error') },
      { data: { url: null }, error: null },
    ]) {
      const { event, signInWithOAuth } = start();
      signInWithOAuth.mockResolvedValueOnce(result);
      await expect(POST(event)).rejects.toMatchObject({
        location: '/signin?authError=oauth&next=%2Fchatbot',
      });
    }
    const { event, signInWithOAuth } = start();
    signInWithOAuth.mockRejectedValueOnce(new Error('network error'));
    await expect(POST(event)).rejects.toMatchObject({
      location: '/signin?authError=oauth&next=%2Fchatbot',
    });
  });
  it('exchanges successful Google callbacks for a cookie session before returning', async () => {
    const { event, exchangeCodeForSession } = start();
    const callbackEvent = {
      ...event,
      url: new URL(
        'https://app.example/auth/callback?provider=google&code=fixture&next=/my-cases',
      ),
    };
    await expect(
      callback(callbackEvent as unknown as Parameters<typeof callback>[0]),
    ).rejects.toMatchObject({ status: 303, location: '/my-cases' });
    expect(exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('fixture');
  });
  it('handles denied consent, invalid/missing codes and forged token fragments without exposing provider errors', async () => {
    for (const query of [
      'error=access_denied&error_description=private-value&code=ignored',
      'code=expired',
      'access_token=forged',
      '',
    ]) {
      const { event, exchangeCodeForSession } = start();
      exchangeCodeForSession.mockResolvedValueOnce({
        data: {},
        error: new Error('secret-detail'),
      });
      const callbackEvent = {
        ...event,
        url: new URL(
          'https://app.example/auth/callback?provider=google&next=/chatbot&' +
            query,
        ),
      };
      await expect(
        callback(callbackEvent as unknown as Parameters<typeof callback>[0]),
      ).rejects.toMatchObject({
        location: '/signin?authError=oauth&next=%2Fchatbot',
      });
      if (query.includes('error=') || !query.startsWith('code='))
        expect(exchangeCodeForSession).not.toHaveBeenCalled();
    }
  });
});
