import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';

const cookieName = 'email-code-challenge';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailChallenge(event: Pick<RequestEvent, 'cookies'>) {
  try {
    const value = JSON.parse(event.cookies.get(cookieName) ?? 'null');
    if (
      value &&
      typeof value.email === 'string' &&
      emailPattern.test(value.email) &&
      Number.isFinite(value.resendAt)
    )
      return { email: value.email, resendAt: value.resendAt as number };
  } catch {
    /* An invalid or missing challenge starts a fresh flow. */
  }
  return null;
}
export async function authAction(
  event: RequestEvent,
  mode: 'send' | 'verify' | 'change',
) {
  const form = await event.request.formData();
  const next = safeReturn(String(form.get('next') ?? ''));
  const challenge = emailChallenge(event);
  if (mode === 'change') {
    event.cookies.delete(cookieName, { path: '/signin' });
    return { step: 'email', email: '', resendAt: 0, message: '' };
  }
  const email = String(form.get('email') ?? challenge?.email ?? '')
    .trim()
    .toLowerCase();
  if (!emailPattern.test(email) || email.length > 254)
    return fail(400, {
      step: 'email',
      email,
      resendAt: 0,
      message: 'Enter a valid email address.',
    });
  if (mode === 'verify') {
    const token = String(form.get('token') ?? '').trim();
    const state = { step: 'verify', email, resendAt: challenge?.resendAt ?? 0 };
    if (!/^\d{6}$/.test(token))
      return fail(400, {
        ...state,
        message: 'Enter the six-digit code from your email.',
      });
    const { data, error } = await event.locals.supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error || !data.session)
      return fail(400, {
        ...state,
        message:
          error?.status === 429
            ? 'Too many attempts. Please wait before trying again.'
            : 'That code is incorrect or has expired. Check the latest email, or request a new code.',
      });
    event.cookies.delete(cookieName, { path: '/signin' });
    redirect(303, next);
  }
  if (challenge && challenge.resendAt > Date.now())
    return fail(429, {
      step: 'verify',
      ...challenge,
      message:
        'Please wait before requesting another code, or change your email address.',
    });
  const { error } = await event.locals.supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error)
    return fail(error.status === 429 ? 429 : 400, {
      step: challenge ? 'verify' : 'email',
      email,
      resendAt: challenge?.resendAt ?? 0,
      message:
        error.status === 429
          ? 'Email requests are temporarily limited. Wait a minute and retry.'
          : 'We could not send your code. Check your email address and try again. If this continues, contact the site owner.',
    });
  const resendAt = Date.now() + 60000;
  event.cookies.set(cookieName, JSON.stringify({ email, resendAt }), {
    path: '/signin',
    httpOnly: true,
    sameSite: 'lax',
    secure: event.url.protocol === 'https:',
    maxAge: 600,
  });
  return {
    step: 'verify',
    email,
    resendAt,
    message:
      'Code sent. Check your inbox and spam folder. Use the most recent code.',
  };
}
