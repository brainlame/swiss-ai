import { browse, constitutions, issueOverview } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
  const [feed, principles, overview] = await Promise.all([
    browse(locals.supabase, url),
    constitutions(locals.supabase),
    issueOverview(locals.supabase),
  ]);
  return {
    ...feed,
    constitutions: principles,
    overview,
    query: url.searchParams.toString(),
    mine: false,
  };
};
