<script lang="ts">
  import type { Comment } from '#lib/discussion.js';
  import { relativeTime } from '#lib/discussion.js';
  let {
    comment,
    now,
    signedIn,
    onreply,
    ondelete,
    disabled = false,
  }: {
    comment: Comment;
    now: number;
    signedIn: boolean;
    onreply: () => void;
    ondelete: () => void;
    disabled?: boolean;
  } = $props();
</script>

<article class="discussion-comment" aria-label="Anonymous comment">
  <div class="comment-heading">
    <strong>Anonymous</strong><time
      datetime={comment.created_at}
      title={new Date(comment.created_at).toLocaleString('en')}
      >{relativeTime(comment.created_at, now)}</time
    >
  </div>
  <p class="comment-body" class:muted={comment.is_deleted}>
    {comment.is_deleted ? 'This comment was deleted.' : comment.body}
  </p>
  <div class="comment-actions">
    <button type="button" class="comment-action" onclick={onreply} {disabled}
      >Reply</button
    >
    {#if signedIn && comment.can_delete && !comment.is_deleted}<button
        type="button"
        class="comment-action muted"
        onclick={ondelete}
        {disabled}>Delete</button
      >{/if}
  </div>
</article>
