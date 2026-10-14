import { redirect } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';
export const GET = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, safeReturn(url.searchParams.get('next')));
  }
  redirect(303, '/signin?authError=1');
};
