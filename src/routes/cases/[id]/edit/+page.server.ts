import { redirect } from '@sveltejs/kit';
export const load = ({ params, url }) =>
  redirect(308, '/issues/' + params.id + '/edit' + url.search);
