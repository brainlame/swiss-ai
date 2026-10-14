import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browseParams, UUID } from '#lib/validation.js';
import type { CaseRecord, Screenshot } from '#lib/types.js';
export function requireUser(event: Pick<RequestEvent, 'locals' | 'url'>) {
  if (!event.locals.user)
    redirect(
      303,
      '/signin?next=' +
        encodeURIComponent(event.url.pathname + event.url.search),
    );
  return event.locals.user;
}
export async function constitutions(db: SupabaseClient) {
  const { data, error: e } = await db
    .from('constitutions')
    .select('number,text,is_sample')
    .order('number');
  if (e) error(503, 'Constitutions are unavailable. Please retry.');
  return data;
}
export async function withImages(
  db: SupabaseClient,
  rows: Omit<CaseRecord, 'screenshots'>[],
) {
  if (!rows.length) return [];
  const { data, error: e } = await db
    .from('case_screenshots')
    .select('case_id,storage_path,display_order')
    .in(
      'case_id',
      rows.map((r) => r.id),
    )
    .order('display_order');
  if (e) error(503, 'Screenshot records could not be loaded.');
  const images = data ?? [];
  const { data: urls, error: signError } = images.length
    ? await db.storage.from('screenshots').createSignedUrls(
        images.map((s) => s.storage_path),
        3600,
      )
    : { data: [], error: null };
  if (signError) error(503, 'Screenshots could not be loaded. Please retry.');
  return rows.map((r) => ({
    ...r,
    screenshots: images
      .filter((s) => s.case_id === r.id)
      .map((s) => ({
        ...s,
        url: urls?.find((u) => u.path === s.storage_path)?.signedUrl ?? '',
      })) as Screenshot[],
  }));
}
export async function browse(db: SupabaseClient, url: URL, mine = false) {
  const { data, error: e } = await db.rpc('browse_cases', {
    ...browseParams(url),
    p_mine: mine,
  });
  if (e) error(503, 'Cases could not be loaded. Please retry.');
  const rows = data ?? [];
  return {
    items: await withImages(db, rows.slice(0, 12)),
    hasMore: rows.length > 12,
  };
}
export async function getCase(db: SupabaseClient, id: string, owner = false) {
  if (!UUID.test(id)) error(404, 'Case not found.');
  if (owner) {
    const { data, error: e } = await db.rpc('owns_case', { p_id: id });
    if (e || !data) error(403, 'Only the owner can manage this case.');
  }
  const { data, error: e } = await db
    .from('cases')
    .select(
      'id,constitution_number,description,improvement,created_at,updated_at,status,version',
    )
    .eq('id', id)
    .maybeSingle();
  if (e) error(503, 'Case could not be loaded.');
  if (!data || (!owner && data.status !== 'published'))
    error(404, 'Case not found.');
  return (await withImages(db, [data]))[0];
}
export async function cleanup(
  db: SupabaseClient,
  id: string,
  candidates: string[],
) {
  const { data, error: e } = await db.rpc('pending_paths', { p_case: id });
  if (e) return false;
  const paths = (data ?? []).filter((p: string) => candidates.includes(p));
  if (paths.length) {
    const { error: e } = await db.storage.from('screenshots').remove(paths);
    if (e) return false;
  }
  const { error: p } = await db.rpc('prune_uploads', { p_id: id });
  return !p;
}
