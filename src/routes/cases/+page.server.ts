import { browse, constitutions } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => ({
  ...(await browse(locals.supabase, url)),
  constitutions: await constitutions(locals.supabase),
  query: url.searchParams.toString(),
  mine: false,
});
