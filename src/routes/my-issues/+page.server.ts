import { browse, constitutions, requireUser } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
  requireUser(event);
  return {
    ...(await browse(event.locals.supabase, event.url, true)),
    constitutions: await constitutions(event.locals.supabase),
    query: event.url.searchParams.toString(),
    mine: true,
  };
};
