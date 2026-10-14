import { json, error } from '@sveltejs/kit';
import { browse } from '#lib/server/data.js';
export const GET = async ({ locals, url }) => {
  const mine = url.searchParams.get('mine') === 'true';
  if (mine && !locals.user) error(401, 'Sign in required.');
  return json(await browse(locals.supabase, url, mine));
};
