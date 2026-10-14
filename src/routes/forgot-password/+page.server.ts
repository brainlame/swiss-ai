import { authAction } from '#lib/server/auth.js';
export const load = () => ({
  mode: 'forgot-password' as const,
  next: '/submit',
});
export const actions = {
  default: (event) => authAction(event, 'forgot-password'),
};
