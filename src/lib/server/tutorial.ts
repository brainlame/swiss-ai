import type { User } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';

const cookie = 'first-email-tutorial';
const options = { path: '/', httpOnly: true, sameSite: 'lax' } as const;

export function queueTutorial(
  event: Pick<RequestEvent, 'cookies' | 'url'>,
  user: User | null,
  verificationStarted: number,
) {
  const confirmed = Date.parse(user?.email_confirmed_at ?? '');
  // OTP verification confirms a new email in this request. Returning sign-ins
  // update last_sign_in_at but keep the original email confirmation timestamp.
  if (
    !user ||
    !(confirmed >= verificationStarted && confirmed <= Date.now() + 2000)
  )
    return;
  event.cookies.set(cookie, user.id, {
    ...options,
    secure: event.url.protocol === 'https:',
    maxAge: 120,
  });
}

export function takeTutorial(event: Pick<RequestEvent, 'cookies' | 'locals'>) {
  const pending = event.cookies.get(cookie);
  if (pending) event.cookies.delete(cookie, options);
  return !!pending && event.locals.user?.id === pending;
}
