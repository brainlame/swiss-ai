import { redirect } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';
export const GET = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  if (code && !url.searchParams.has('error')) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, safeReturn(url.searchParams.get('next')));
  }
  const parameters = new URLSearchParams({
    authError: url.searchParams.get('provider') === 'google' ? 'oauth' : '1',
  });
  if (url.searchParams.has('next'))
    parameters.set('next', safeReturn(url.searchParams.get('next')));
  // Never reflect provider error descriptions, codes or tokens into the page.
  redirect(303, '/signin?' + parameters);
};
