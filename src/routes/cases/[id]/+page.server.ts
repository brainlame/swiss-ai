import { getCase, constitutions, requireUser } from '#lib/server/data.js';
import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const { data: owns } = locals.user
    ? await locals.supabase.rpc('owns_case', { p_id: params.id })
    : { data: false };
  const c = await getCase(locals.supabase, params.id, !!owns);
  return {
    item: c,
    constitutions: await constitutions(locals.supabase),
    owns: !!owns,
    cleanupWarning: url.searchParams.has('cleanup'),
  };
};
export const actions: Actions = {
  delete: async (event) => {
    requireUser(event);
    await getCase(event.locals.supabase, event.params.id, true);
    const { data: paths, error: e } = await event.locals.supabase.rpc(
      'begin_delete',
      { p_id: event.params.id },
    );
    if (e)
      return fail(400, { message: 'Deletion could not start. Please retry.' });
    if (paths?.length) {
      const { error: e } = await event.locals.supabase.storage
        .from('screenshots')
        .remove(paths);
      if (e)
        return fail(500, {
          message:
            'The case is hidden, but image cleanup failed. Retry deletion from My Cases.',
        });
    }
    const { error: f } = await event.locals.supabase.rpc('finish_delete', {
      p_id: event.params.id,
    });
    if (f)
      return fail(500, {
        message: 'Image cleanup is incomplete. Retry deletion from My Cases.',
      });
    redirect(303, '/my-cases?deleted=1');
  },
};
