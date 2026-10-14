import { authAction } from '#lib/server/auth.js';
import { redirect } from '@sveltejs/kit';
export const load = ({ locals }) => {
  if (!locals.user) redirect(303, '/forgot-password');
  return { mode: 'reset-password' as const, next: '/my-cases' };
};
export const actions = {
  default: (event) => authAction(event, 'reset-password'),
};
