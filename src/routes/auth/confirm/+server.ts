import { redirect } from '@sveltejs/kit';
import { queueTutorial } from '#lib/server/tutorial.js';
import { safeReturn } from '#lib/validation.js';
import type { EmailOtpType } from '@supabase/supabase-js';
export const GET = async (event) => {
  const { url, locals } = event;
  const token_hash = url.searchParams.get('token_hash'),
    type = url.searchParams.get('type');
  if (
    token_hash &&
    type &&
    ['signup', 'email', 'email_change'].includes(type)
  ) {
    const verificationStarted = Date.now();
    const { data, error } = await locals.supabase.auth.verifyOtp({
      token_hash,
      type: type as EmailOtpType,
    });
    if (!error) {
      if (type !== 'email_change' && data.session)
        queueTutorial(event, data.user, verificationStarted);
      redirect(303, safeReturn(url.searchParams.get('next')));
    }
  }
  redirect(303, '/signin?authError=1');
};
