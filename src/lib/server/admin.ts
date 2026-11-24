import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function isAdmin(db: SupabaseClient) {
  const result = await db.rpc('is_admin');
  return !result.error && result.data === true;
}
export async function requireAdmin(event: Pick<RequestEvent, 'locals'>) {
  if (!event.locals.user) error(401, 'Sign in required.');
  const result = await event.locals.supabase.rpc('is_admin');
  if (result.error)
    error(503, 'Admin access could not be verified. Please retry.');
  if (result.data !== true) error(403, 'Admin access required.');
}

// Storage deletion uses the signed-in SDK client and its database policies.
export async function deleteIssue(db: SupabaseClient, id: string) {
  const { data: paths, error: beginError } = await db.rpc('begin_delete', {
    p_id: id,
  });
  if (beginError)
    return {
      status: beginError.code === '42501' ? 403 : 400,
      message: 'Deletion could not start. Check your access and retry.',
    };
  if (paths?.length) {
    const { error: storageError } = await db.storage
      .from('screenshots')
      .remove(paths);
    if (storageError)
      return {
        status: 503,
        message:
          'The issue is hidden, but image cleanup failed. Retry deletion on this issue page.',
      };
  }
  const { error: finishError } = await db.rpc('finish_delete', { p_id: id });
  return finishError
    ? {
        status: finishError.code === '42501' ? 403 : 503,
        message:
          'Deletion could not finish. Check your access and retry on this issue page.',
      }
    : null;
}
