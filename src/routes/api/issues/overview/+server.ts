import { json, error } from '@sveltejs/kit';
import { issueOverview } from '#lib/server/data.js';
export const GET = async ({ locals }) => {
  const overview = await issueOverview(locals.supabase);
  if (!overview) error(503, 'The overview is unavailable. Please retry.');
  return json(overview);
};
