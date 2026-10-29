import { redirect } from '@sveltejs/kit';
import { requireUser, constitutions } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async (event) => {
  if (event.url.searchParams.get('source') !== 'chatbot')
    redirect(303, '/chatbot');
  requireUser(event);
  return { constitutions: await constitutions(event.locals.supabase) };
};
