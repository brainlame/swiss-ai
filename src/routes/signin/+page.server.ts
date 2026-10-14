import { authAction } from '#lib/server/auth.js';
import { safeReturn } from '#lib/validation.js';
export const load = ({ url }) => ({
  mode: 'signin' as const,
  next: safeReturn(url.searchParams.get('next')),
});
export const actions = { default: (event) => authAction(event, 'signin') };
