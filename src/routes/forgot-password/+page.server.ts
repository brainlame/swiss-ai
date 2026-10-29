import { redirect } from '@sveltejs/kit';
import { safeReturn } from '#lib/validation.js';
export const load = ({ url }) =>
  redirect(
    303,
    '/signin?next=' +
      encodeURIComponent(safeReturn(url.searchParams.get('next'))),
  );
