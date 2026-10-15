import { error, redirect } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';
import type { RequestHandler } from './$types';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';

export const POST: RequestHandler = async ({ request, url, locals }) => {
  if (request.headers.get('origin') !== url.origin)
    error(403, 'Invalid request origin.');
  const form = await request.formData();
  const next = safeReturn(String(form.get('next') ?? ''));
  const callback = new URL('/auth/callback', url.origin);
  callback.searchParams.set('next', next);
  callback.searchParams.set('provider', 'google');
  // The existing SSR client writes the PKCE verifier to cookies. On the server
  // signInWithOAuth returns a URL; it does not navigate the browser itself.
  const result = await locals.supabase.auth
    .signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    .catch(() => null);
  if (!result?.data.url || result.error)
    redirect(
      303,
      '/signin?' + new URLSearchParams({ authError: 'oauth', next }),
    );
  redirect(303, result.data.url, {
    external: [new URL(PUBLIC_SUPABASE_URL).origin],
  });
};
