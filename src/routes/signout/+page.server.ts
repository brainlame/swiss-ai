import { redirect, fail } from '@sveltejs/kit';
export const actions = {
  default: async ({ locals }) => {
    const { error } = await locals.supabase.auth.signOut();
    if (error) return fail(500, { message: 'Sign out failed. Please retry.' });
    redirect(303, '/');
  },
};
