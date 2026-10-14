import { requireUser, getCase, constitutions } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
  requireUser(event);
  return {
    item: await getCase(event.locals.supabase, event.params.id, true),
    constitutions: await constitutions(event.locals.supabase),
  };
};
