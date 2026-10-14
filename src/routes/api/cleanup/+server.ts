import { CLEANUP_SECRET, SUPABASE_SERVICE_ROLE_KEY } from '$app/env/private';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import { createClient } from '@supabase/supabase-js';
import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
export const POST = async ({ request }) => {
  const expected = CLEANUP_SECRET,
    provided = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (
    !expected ||
    !provided ||
    Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  )
    error(401, 'Not authorized.');
  if (!SUPABASE_SERVICE_ROLE_KEY) error(503, 'Cleanup is not configured.');
  const db = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error: e } = await db.rpc('cleanup_candidates');
  if (e) error(500, 'Cleanup query failed.');
  if (data?.length) {
    const { error: e } = await db.storage.from('screenshots').remove(data);
    if (e) error(500, 'Image cleanup failed; candidates remain for retry.');
  }
  const { error: f } = await db.rpc('finish_cleanup');
  if (f) error(500, 'Cleanup finalization failed.');
  return json({ removed: data?.length ?? 0 });
};
