import { avatarUrls } from '#lib/server/profiles.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Discussion } from '#lib/discussion.js';
// A missing migration/outage must not take down public case browsing.
export async function discussions(
  db: SupabaseClient,
  ids: string[],
): Promise<Discussion[] | null> {
  if (!ids.length) return [];
  const { data, error } = await db.rpc('case_discussions', { p_cases: ids });
  if (error) return null;
  return avatarUrls(
    db,
    (data as Discussion[]).map((item) => {
      const total_votes = item.total_votes ?? item.upvotes + item.downvotes;
      const total_comments =
        item.total_comments ??
        item.comment_count +
          item.threads.wanted.comment_count +
          item.threads.unwanted.comment_count;
      if (item.my_vote) return { ...item, total_votes, total_comments };
      const empty = () => ({ comment_count: 0, root_count: 0, preview: [] });
      return {
        case_id: item.case_id,
        my_vote: item.my_vote,
        can_view_results: item.can_view_results === true,
        upvotes: item.can_view_results ? item.upvotes : 0,
        downvotes: item.can_view_results ? item.downvotes : 0,
        total_votes,
        total_comments,
        ...empty(),
        threads: { wanted: empty(), unwanted: empty() },
      };
    }),
  );
}
