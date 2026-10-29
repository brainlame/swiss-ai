import { redirect } from '@sveltejs/kit';
import { authAction, emailChallenge } from '#lib/server/auth.js';
import { safeReturn } from '#lib/validation.js';
export const load = (event) => {
  const next = safeReturn(event.url.searchParams.get('next'));
  if (event.locals.user) redirect(303, next);
  return { next, challenge: emailChallenge(event) };
};
export const actions = {
  send: (event) => authAction(event, 'send'),
  verify: (event) => authAction(event, 'verify'),
  change: (event) => authAction(event, 'change'),
};
