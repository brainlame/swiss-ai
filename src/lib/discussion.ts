export type Vote = -1 | 0 | 1;
export type Comment = {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  is_deleted: boolean;
  author: 'Anonymous';
  can_delete: boolean;
  reply_count: number;
};
export type Discussion = {
  case_id: string;
  upvotes: number;
  downvotes: number;
  my_vote: Vote;
  comment_count: number;
  root_count: number;
  preview: Comment[];
};
export type CommentPage = { items: Comment[]; has_more: boolean };
export function relativeTime(value: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now';
  const [amount, unit] =
    seconds < 3600
      ? [Math.floor(seconds / 60), 'minute']
      : seconds < 86400
        ? [Math.floor(seconds / 3600), 'hour']
        : seconds < 2592000
          ? [Math.floor(seconds / 86400), 'day']
          : seconds < 31536000
            ? [Math.floor(seconds / 2592000), 'month']
            : [Math.floor(seconds / 31536000), 'year'];
  return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
}
export function validateComment(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000)
    throw new Error('Write a comment of 1–2,000 characters.');
}
export function validateVote(value: unknown): asserts value is Vote {
  if (value !== -1 && value !== 0 && value !== 1)
    throw new Error('Choose Upvote or Downvote.');
}
export function appendComments(current: Comment[], incoming: Comment[]) {
  const ids = new Set(current.map((c) => c.id));
  return [...current, ...incoming.filter((c) => !ids.has(c.id))];
}
