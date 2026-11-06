<script lang="ts">
  import { untrack, tick } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type {
    Comment,
    CommentPage,
    Discussion,
    DiscussionSide,
    ThreadSummary,
  } from '#lib/discussion.js';
  import {
    appendComments,
    threadSummary,
    validateComment,
  } from '#lib/discussion.js';
  import CommentEntry from '#lib/components/CommentEntry.svelte';
  let {
    caseId,
    initial,
    side,
    signedIn,
    now,
    ready,
    signIn,
    read,
    mutate,
  }: {
    caseId: string;
    initial: ThreadSummary;
    side: DiscussionSide;
    signedIn: boolean;
    now: number;
    ready: boolean;
    signIn: string;
    read: <T>(params?: string) => Promise<T>;
    mutate: (
      body: unknown,
    ) => Promise<{ saved: boolean; id: string; comment?: Comment | null }>;
  } = $props();
  const label = $derived(
    side === 'wanted'
      ? 'Add a wanted reason'
      : side === 'unwanted'
        ? 'Add an unwanted reason'
        : 'Add a comment',
  );
  const fieldId = $derived(side + '-' + caseId);
  let discussion = $state<ThreadSummary>(untrack(() => initial));
  let comments = $state<Comment[]>(untrack(() => initial?.preview ?? []));
  let expanded = $state(false),
    moreRoots = $state(false),
    loadingRoots = $state(false);
  let rootsError = $state(''),
    error = $state(''),
    notice = $state('');
  let refreshing = $state(false),
    posting = $state(false);
  let draft = $state(''),
    pendingId = '',
    pendingBody = '';
  let replyParent = $state<string | null>(null),
    replyDraft = $state(''),
    replying = $state(false),
    replyError = $state('');
  let replyId = '',
    replyBody = '',
    replyTarget = '';
  type Replies = {
    items: Comment[];
    posted: Comment[];
    has_more: boolean;
    open: boolean;
    loading: boolean;
    error: string;
  };
  let threads = $state<Record<string, Replies>>({});
  let deleteTarget = $state<Comment | null>(null),
    deleting = $state(false);
  let deleteDialog: HTMLDialogElement;
  let replyInput = $state<HTMLTextAreaElement>();
  $effect(() => {
    const incoming = initial;
    discussion = incoming;
    comments = incoming?.preview ?? [];
    expanded = false;
    threads = {};
    rootsError = '';
    error = '';
  });
  async function refresh() {
    discussion = threadSummary(await read<Discussion>(), side);
    if (!expanded) comments = discussion.preview;
  }
  async function retrySummary() {
    if (refreshing) return;
    refreshing = true;
    error = '';
    try {
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      refreshing = false;
    }
  }
  async function loadRoots(append = false) {
    if (loadingRoots) return;
    loadingRoots = true;
    rootsError = '';
    const last = append ? comments.at(-1) : null;
    const params = new URLSearchParams({ view: 'comments', stance: side });
    if (last) {
      params.set('time', last.created_at);
      params.set('cursor', last.id);
    }
    try {
      const result = await read<CommentPage>('?' + params);
      comments = append ? appendComments(comments, result.items) : result.items;
      expanded = true;
      moreRoots = result.has_more;
    } catch (e) {
      rootsError = (e as Error).message;
    } finally {
      loadingRoots = false;
    }
  }
  function collapse() {
    expanded = false;
    comments = discussion?.preview ?? [];
    threads = {};
    replyParent = null;
  }
  async function loadReplies(parent: string, append = false) {
    if (threads[parent]?.loading) return;
    const previous = threads[parent];
    threads[parent] = {
      items: previous?.items ?? [],
      posted: previous?.posted ?? [],
      has_more: previous?.has_more ?? false,
      open: true,
      loading: true,
      error: '',
    };
    const last = append ? previous?.items.at(-1) : null;
    const params = new URLSearchParams({
      view: 'comments',
      stance: side,
      parent,
    });
    if (last) {
      params.set('time', last.created_at);
      params.set('cursor', last.id);
    }
    try {
      const result = await read<CommentPage>('?' + params);
      threads[parent] = {
        items: append
          ? appendComments(previous?.items ?? [], result.items)
          : result.items,
        posted: (previous?.posted ?? []).filter(
          (p) => !result.items.some((r) => r.id === p.id),
        ),
        has_more: result.has_more,
        open: true,
        loading: false,
        error: '',
      };
    } catch (e) {
      threads[parent].error = (e as Error).message;
      threads[parent].loading = false;
    }
  }
  async function startReply(parent: string) {
    if (!signedIn) {
      await goto(signIn);
      return;
    }
    if (replying) return;
    replyParent = parent;
    replyDraft = '';
    replyError = '';
    replyId = '';
    await tick();
    replyInput?.focus();
  }
  async function postComment(event: SubmitEvent) {
    event.preventDefault();
    if (posting) return;
    error = '';
    notice = '';
    try {
      validateComment(draft);
    } catch (e) {
      error = (e as Error).message;
      return;
    }
    const body = draft.trim();
    if (!pendingId || pendingBody !== body) {
      pendingId = crypto.randomUUID();
      pendingBody = body;
    }
    posting = true;
    try {
      await mutate({
        action: 'comment',
        id: pendingId,
        body,
        parent: null,
        stance: side,
      });
      draft = '';
      pendingId = '';
      notice = 'Comment posted.';
      try {
        await refresh();
        if (expanded) await loadRoots();
      } catch {
        error =
          'Comment posted. The discussion could not refresh; please retry loading it.';
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      posting = false;
    }
  }
  async function postReply(event: SubmitEvent) {
    event.preventDefault();
    if (replying || !replyParent) return;
    replyError = '';
    try {
      validateComment(replyDraft);
    } catch (e) {
      replyError = (e as Error).message;
      return;
    }
    const body = replyDraft.trim(),
      parent = replyParent;
    if (!replyId || replyBody !== body || replyTarget !== parent) {
      replyId = crypto.randomUUID();
      replyBody = body;
      replyTarget = parent;
    }
    replying = true;
    try {
      const saved = await mutate({
        action: 'comment',
        id: replyId,
        body,
        parent,
        stance: side,
      });
      replyDraft = '';
      replyId = '';
      replyParent = null;
      notice = 'Reply posted.';
      try {
        await refresh();
        comments = comments.map((c) =>
          c.id === parent
            ? { ...c, reply_count: c.reply_count + (expanded ? 1 : 0) }
            : c,
        );
        await loadReplies(parent);
        if (
          saved.comment &&
          threads[parent] &&
          !threads[parent].items.some((c) => c.id === saved.comment!.id)
        ) {
          threads[parent].posted = appendComments(threads[parent].posted, [
            saved.comment,
          ]);
        }
      } catch {
        error = 'Reply posted. Refresh the discussion to see it.';
      }
    } catch (e) {
      replyError = (e as Error).message;
    } finally {
      replying = false;
    }
  }
  function confirmDelete(comment: Comment) {
    deleteTarget = comment;
    deleteDialog.showModal();
  }
  async function removeComment() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    deleting = true;
    error = '';
    try {
      await mutate({ action: 'delete', id: target.id });
      deleteDialog.close();
      notice = 'Comment deleted.';
      if (target.parent_id && threads[target.parent_id])
        threads[target.parent_id].posted = threads[
          target.parent_id
        ].posted.filter((c) => c.id !== target.id);
      await refresh();
      if (expanded) await loadRoots();
      if (target.parent_id && threads[target.parent_id]?.open)
        await loadReplies(target.parent_id);
    } catch (e) {
      error = (e as Error).message;
      deleteDialog.close();
    } finally {
      deleting = false;
    }
  }
</script>

<div class="reason-thread">
  <div class="discussion-heading">
    <h3>Comments <span>{discussion.comment_count}</span></h3>
    <span class="anonymous-note">Anonymous discussion</span>
  </div>
  {#if signedIn}
    <form class="comment-composer" onsubmit={postComment}>
      <label class="sr-only" for={'comment-' + fieldId}>{label}</label>
      <textarea
        id={'comment-' + fieldId}
        bind:value={draft}
        placeholder={side === 'general'
          ? 'Add to the discussion…'
          : 'Explain your reasoning…'}
        rows="2"
        maxlength="2000"
        required
        disabled={posting}
        aria-describedby={'comment-help-' + fieldId}></textarea>
      <div class="comment-composer-footer">
        <span id={'comment-help-' + fieldId}>Your comment will be public.</span
        ><button
          type="submit"
          class="button small-button"
          disabled={!ready || posting || !draft.trim()}
          >{posting ? 'Posting…' : 'Comment'}</button
        >
      </div>
    </form>
  {:else}
    <div class="comment-signin">
      <textarea
        aria-label={label}
        placeholder="Sign in to add a comment…"
        rows="2"
        readonly></textarea>
      <div>
        <a href={signIn}>Sign in to comment</a><span>Comments are public.</span>
      </div>
    </div>
  {/if}
  {#if notice}<p class="discussion-status" role="status">{notice}</p>{/if}
  {#if !comments.length}<p class="discussion-empty">
      Be the first to comment.
    </p>{/if}
  <div class="comment-list">
    {#each comments as comment (comment.id)}
      <div class="comment-thread">
        <CommentEntry
          {comment}
          {now}
          {signedIn}
          disabled={!ready || replying || deleting}
          onreply={() => startReply(comment.id)}
          ondelete={() => confirmDelete(comment)}
        />
        {#if comment.reply_count > 0 || threads[comment.id]?.items.length}
          <button
            class="thread-toggle"
            type="button"
            disabled={!ready || threads[comment.id]?.loading}
            aria-expanded={threads[comment.id]?.open ?? false}
            aria-controls={'replies-' + comment.id}
            onclick={() => {
              if (threads[comment.id]?.open) threads[comment.id].open = false;
              else void loadReplies(comment.id);
            }}
            >{threads[comment.id]?.loading
              ? 'Loading replies…'
              : threads[comment.id]?.open
                ? 'Hide replies'
                : `Show ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}</button
          >
        {/if}
        {#if threads[comment.id]?.open}<div
            class="comment-replies"
            id={'replies-' + comment.id}
          >
            {#each threads[comment.id].items as reply (reply.id)}<CommentEntry
                comment={reply}
                {now}
                {signedIn}
                disabled={!ready || replying || deleting}
                onreply={() => startReply(comment.id)}
                ondelete={() => confirmDelete(reply)}
              />{/each}
            {#if threads[comment.id].error}<p
                class="discussion-error"
                role="alert"
              >
                {threads[comment.id].error}
              </p>
              <button
                class="thread-toggle"
                type="button"
                onclick={() => loadReplies(comment.id)}>Retry replies</button
              >{/if}
            {#if threads[comment.id].has_more}<button
                class="thread-toggle"
                type="button"
                disabled={threads[comment.id].loading}
                onclick={() => loadReplies(comment.id, true)}
                >{threads[comment.id].loading
                  ? 'Loading…'
                  : 'Show more replies'}</button
              >{/if}
            {#each threads[comment.id].posted as reply (reply.id)}<CommentEntry
                comment={reply}
                {now}
                {signedIn}
                disabled={!ready || replying || deleting}
                onreply={() => startReply(comment.id)}
                ondelete={() => confirmDelete(reply)}
              />{/each}
          </div>{/if}
        {#if replyParent === comment.id}<form
            class="reply-composer"
            onsubmit={postReply}
          >
            <label for={'reply-' + comment.id}>Reply to Anonymous</label
            ><textarea
              id={'reply-' + comment.id}
              bind:this={replyInput}
              bind:value={replyDraft}
              placeholder="Write a reply…"
              rows="2"
              required
              maxlength="2000"
              disabled={replying}></textarea>
            {#if replyError}<p role="alert" class="discussion-error">
                {replyError}
              </p>{/if}
            <div class="reply-composer-actions">
              <button
                type="button"
                class="comment-action"
                disabled={replying}
                onclick={() => (replyParent = null)}>Cancel</button
              ><button
                class="button small-button"
                disabled={replying || !replyDraft.trim()}
                >{replying ? 'Posting…' : 'Post reply'}</button
              >
            </div>
          </form>{/if}
      </div>
    {/each}
  </div>
  {#if rootsError}<p class="discussion-error" role="alert">{rootsError}</p>
    <button class="thread-toggle" onclick={() => loadRoots(expanded)}
      >Retry comments</button
    >{/if}
  {#if !expanded && discussion.root_count > comments.length}<button
      class="show-comments"
      type="button"
      disabled={!ready || loadingRoots}
      aria-expanded="false"
      onclick={() => loadRoots()}
      >{loadingRoots
        ? 'Loading comments…'
        : `Show all comments (${discussion.comment_count})`}</button
    >{/if}
  {#if expanded}<div class="expanded-comments-actions">
      {#if moreRoots}<button
          class="show-comments"
          type="button"
          disabled={loadingRoots}
          onclick={() => loadRoots(true)}
          >{loadingRoots ? 'Loading…' : 'Load more comments'}</button
        >{/if}<button
        class="comment-action"
        type="button"
        disabled={loadingRoots}
        onclick={collapse}
        aria-expanded="true">Show fewer comments</button
      >
    </div>{/if}
  {#if error}<p class="discussion-error" role="alert">{error}</p>{/if}
  {#if error}<button
      type="button"
      class="comment-action"
      disabled={!ready || refreshing}
      onclick={retrySummary}
      >{refreshing ? 'Loading…' : 'Retry discussion'}</button
    >{/if}
</div>
<dialog
  class="confirm-dialog"
  bind:this={deleteDialog}
  aria-labelledby={'delete-comment-' + fieldId}
>
  <h2 id={'delete-comment-' + fieldId}>Delete your comment?</h2>
  <p>Your comment will be removed. Replies will remain in the discussion.</p>
  <div class="dialog-actions">
    <button
      class="button secondary"
      disabled={deleting}
      onclick={() => deleteDialog.close()}>Keep comment</button
    ><button class="button danger" disabled={deleting} onclick={removeComment}
      >{deleting ? 'Deleting…' : 'Delete comment'}</button
    >
  </div>
</dialog>
