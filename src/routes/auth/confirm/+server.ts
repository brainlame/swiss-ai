import { redirect } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';
import type { EmailOtpType } from '@supabase/supabase-js';
export const GET = async ({ url, locals }) => {
  const token_hash = url.searchParams.get('token_hash'),
    type = url.searchParams.get('type');
  if (
    token_hash &&
    type &&
    ['signup', 'email', 'recovery', 'email_change'].includes(type)
  ) {
    const { error } = await locals.supabase.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (!error)
      redirect(
        303,
        type === 'recovery'
          ? '/reset-password'
          : safeReturn(url.searchParams.get('next')),
      );
  }
  redirect(303, '/signin?authError=1');
};
