import type { SupabaseClient } from '@supabase/supabase-js';
import type { Discussion } from '#lib/discussion.js';
// A missing migration/outage must not take down public case browsing.
export async function discussions(
  db: SupabaseClient,
  ids: string[],
): Promise<Discussion[] | null> {
  if (!ids.length) return [];
  const { data, error } = await db.rpc('case_discussions', { p_cases: ids });
  return error ? null : data;
}
