import { json, error } from '@sveltejs/kit';
import { requireAdmin, deleteIssue } from '#lib/server/admin.js';
import { UUID } from '#lib/validation.js';

export const POST = async (event) => {
  await requireAdmin(event);
  if (event.request.headers.get('origin') !== event.url.origin)
    error(403, 'Invalid request origin.');
  if (!UUID.test(event.params.id)) error(400, 'Invalid issue ID.');
  const failure = await deleteIssue(event.locals.supabase, event.params.id);
  if (failure)
    return json({ message: failure.message }, { status: failure.status });
  return json({ deleted: true });
};
