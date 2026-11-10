import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { discussions } from '#lib/server/discussion.js';
import { browseParams, rankedParams, UUID } from '#lib/validation.js';
import type { CaseRecord, CaseSummary, Screenshot } from '#lib/types.js';
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
  if (e) error(503, 'Principles are unavailable. Please retry.');
  return data;
}
export async function withImages<T extends { id: string }>(
  db: SupabaseClient,
  rows: T[],
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
  let rows: Omit<CaseSummary, 'screenshots' | 'discussion'>[];
  let revision: string | null = null;
  let topics: { id: string; name: string }[] = [];
  let hasUnclassified = false;
  let rankingTime = '';
  let rankingOffset = 0;
  const pageSize = mine ? 12 : 10;
  if (mine) {
    const { data, error: e } = await db
      .rpc('browse_cases', { ...browseParams(url), p_mine: true })
      .select(
        'id,constitution_number,description,improvement,created_at,updated_at,status,version,behavior,is_sample',
      );
    if (e) error(503, 'Issues could not be loaded. Please retry.');
    rows = (data ?? []) as typeof rows;
  } else {
    let params;
    try {
      params = rankedParams(url);
    } catch (e) {
      error(400, (e as Error).message);
    }
    const { data, error: e } = await db.rpc('browse_ranked_issues', params);
    if (e?.code === '40001')
      error(409, 'Issues have changed. Refresh the ranking to load more.');
    if (e) error(503, 'Issues could not be loaded. Please retry.');
    rows = data.items;
    rankingTime = data.asof;
    rankingOffset = data.offset;
    revision = data.revision;
    topics = data.topics;
    hasUnclassified = data.has_unclassified;
  }
  const visible = rows.slice(0, pageSize);
  const last = visible.at(-1);
  const summaries = await discussions(
    db,
    visible.map((row) => row.id),
  );
  return {
    items: await withImages(
      db,
      visible.map((row) => ({
        ...row,
        discussion: summaries?.find((s) => s.case_id === row.id) ?? null,
      })),
    ),
    hasMore: rows.length > pageSize,
    revision,
    topics,
    hasUnclassified,
    nextCursor:
      !mine && last && rows.length > pageSize
        ? {
            offset: rankingOffset + pageSize,
            asof: rankingTime,
            revision: revision!,
          }
        : null,
  };
}
export async function getCase(db: SupabaseClient, id: string, owner = false) {
  if (!UUID.test(id)) error(404, 'Issue not found.');
  if (owner) {
    const { data, error: e } = await db.rpc('owns_case', { p_id: id });
    if (e || !data) error(403, 'Only the owner can manage this issue.');
  }
  const { data, error: e } = await db
    .from('cases')
    .select(
      'id,constitution_number,description,improvement,created_at,updated_at,status,version,chat_prompt,chat_response,transcript,behavior,is_sample',
    )
    .eq('id', id)
    .maybeSingle();
  if (e) error(503, 'Issue could not be loaded.');
  if (!data || (!owner && data.status !== 'published'))
    error(404, 'Issue not found.');
  return (await withImages(db, [data]))[0] as CaseRecord;
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

// Aggregate public rows only; a visualization outage must not hide the feed.
export async function issueOverview(
  db: SupabaseClient,
): Promise<import('#lib/issue-overview.js').IssueOverview | null> {
  const { data, error } = await db.rpc('issue_overview');
  return error ? null : data;
}
