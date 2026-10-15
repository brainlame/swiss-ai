import { requireUser } from '#lib/server/data.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
  requireUser(event);
  return {};
};
