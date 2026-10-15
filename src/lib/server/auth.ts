import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';
export async function authAction(
  event: RequestEvent,
  mode: 'signin' | 'signup' | 'forgot-password' | 'reset-password',
) {
  const form = await event.request.formData();
  const email = String(form.get('email') ?? '').trim(),
    password = String(form.get('password') ?? ''),
    next = safeReturn(String(form.get('next') ?? ''));
  if (mode !== 'reset-password' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail(400, { message: 'Enter a valid email address.', email });
  if (mode !== 'forgot-password' && password.length < 8)
    return fail(400, {
      message: 'Use a password with at least 8 characters.',
      email,
    });
  const db = event.locals.supabase;
  if (mode === 'signin') {
    const { error: e } = await db.auth.signInWithPassword({ email, password });
    if (e)
      return fail(400, {
        message:
          'Sign in failed. Check your password and confirm your email if needed.',
        email,
      });
    redirect(303, next);
  }
  if (mode === 'signup') {
    const { data, error: e } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          event.url.origin + '/auth/callback?next=' + encodeURIComponent(next),
      },
    });
    if (e)
      return fail(400, {
        message:
          'Signup failed. Please retry or sign in if you already have an account.',
        email,
      });
    if (data.session) redirect(303, next);
    return {
      message:
        'Check your email to confirm your account. Open the link to finish signing in.',
      success: true,
      email,
    };
  }
  if (mode === 'forgot-password') {
    const { error: e } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: event.url.origin + '/auth/callback?next=/reset-password',
    });
    if (e)
      return fail(400, {
        message: 'The reset request could not be sent. Please retry.',
        email,
      });
    return {
      message:
        'If an account exists for this email, a password reset link is on its way.',
      success: true,
      email,
    };
  }
  if (!event.locals.user) redirect(303, '/forgot-password');
  const { error: e } = await db.auth.updateUser({ password });
  if (e)
    return fail(400, {
      message: 'Password update failed. Request a fresh reset link and retry.',
      email,
    });
  redirect(303, '/my-cases?password=updated');
}
