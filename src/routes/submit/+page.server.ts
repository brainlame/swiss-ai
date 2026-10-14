import { requireUser, constitutions } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
  requireUser(event);
  return { constitutions: await constitutions(event.locals.supabase) };
};
