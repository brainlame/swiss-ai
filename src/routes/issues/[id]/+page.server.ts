import { getCase, constitutions, requireUser } from '#lib/server/data.js';
import { isAdmin, deleteIssue } from '#lib/server/admin.js';
import { discussions } from '#lib/server/discussion.js';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const admin = !!locals.user && (await isAdmin(locals.supabase));
  const { data: owns } = locals.user
    ? await locals.supabase.rpc('owns_case', { p_id: params.id })
    : { data: false };
  const c = await getCase(locals.supabase, params.id, !!owns, admin);
  return {
    item: c,
    discussion:
      c.status === 'published'
        ? ((await discussions(locals.supabase, [c.id]))?.[0] ?? null)
        : null,
    constitutions: await constitutions(locals.supabase),
    owns: !!owns,
    isAdmin: admin,
    cleanupWarning: url.searchParams.has('cleanup'),
  };
};
export const actions: Actions = {
  delete: async (event) => {
    requireUser(event);
    await getCase(event.locals.supabase, event.params.id, true);
    const failure = await deleteIssue(event.locals.supabase, event.params.id);
    if (failure) return fail(failure.status, { message: failure.message });
    redirect(303, '/my-issues?deleted=1');
  },
};
