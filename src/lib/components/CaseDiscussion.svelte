<script lang="ts">
  import { onMount, untrack, tick } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type {
    Comment,
    CommentPage,
    Discussion,
    Vote,
  } from '#lib/discussion.js';
  import { appendComments, validateComment } from '#lib/discussion.js';
  import CommentEntry from '#lib/components/CommentEntry.svelte';
  let {
    caseId,
    initial,
    signedIn,
  }: { caseId: string; initial: Discussion | null; signedIn: boolean } =
    $props();
  let discussion = $state<Discussion | null>(untrack(() => initial));
  let comments = $state<Comment[]>(untrack(() => initial?.preview ?? []));
  let expanded = $state(false),
    moreRoots = $state(false),
    loadingRoots = $state(false);
  let rootsError = $state(''),
    error = $state(''),
    notice = $state('');
  let ready = $state(false),
    voting = $state(false),
    refreshing = $state(false),
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
  let now = $state(Date.now());
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
  const endpoint = $derived('/api/issues/' + caseId + '/discussion');
  const totalVotes = $derived(
    (discussion?.upvotes ?? 0) + (discussion?.downvotes ?? 0),
  );
  const upPercent = $derived(
    totalVotes ? Math.round((discussion!.upvotes / totalVotes) * 100) : 0,
  );
  const signIn = $derived(
    '/signin?next=' + encodeURIComponent(page.url.pathname + page.url.search),
  );
  onMount(() => {
    ready = true;
    const timer = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(timer);
  });
  async function read<T>(params = ''): Promise<T> {
    const response = await fetch(endpoint + params);
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.message ?? 'Could not load the discussion. Please retry.',
      );
    return result;
  }
  async function mutate(body: unknown) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message ?? 'Could not save. Please retry.');
    return result as { saved: boolean; id: string; comment?: Comment | null };
  }
  async function refresh() {
    discussion = await read<Discussion>();
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
  async function vote(value: Vote) {
    if (!signedIn) {
      await goto(signIn);
      return;
    }
    if (voting || !discussion) return;
    const selected = discussion.my_vote === value ? 0 : value;
    voting = true;
    error = '';
    notice = '';
    try {
      await mutate({ action: 'vote', value: selected });
      try {
        await refresh();
      } catch {
        error =
          'Your vote was saved, but the totals could not refresh. Retry loading the discussion.';
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      voting = false;
    }
  }
  async function loadRoots(append = false) {
    if (loadingRoots) return;
    loadingRoots = true;
    rootsError = '';
    const last = append ? comments.at(-1) : null;
    const params = new URLSearchParams({ view: 'comments' });
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
    const params = new URLSearchParams({ view: 'comments', parent });
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
      await mutate({ action: 'comment', id: pendingId, body, parent: null });
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

<section class="case-discussion" aria-label="Issue voting and discussion">
  {#if discussion}
    <div
      class="vote-bar"
      role="img"
      aria-label={`${discussion.upvotes} upvotes and ${discussion.downvotes} downvotes`}
    >
      <span class="vote-bar-up" style:width={`${totalVotes ? upPercent : 0}%`}
      ></span>
      <span
        class="vote-bar-down"
        style:width={`${totalVotes ? 100 - upPercent : 0}%`}
      ></span>
    </div>
    <div class="vote-summary">
      <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span><span
        class="upvote-count">{discussion.upvotes} up · {upPercent}%</span
      ><span class="downvote-count"
        >{discussion.downvotes} down · {totalVotes ? 100 - upPercent : 0}%</span
      >
    </div>
    <div class="vote-choices" role="group" aria-label="Is this issue useful?">
      <button
        type="button"
        class="vote-choice upvote"
        class:selected={discussion.my_vote === 1}
        aria-pressed={discussion.my_vote === 1}
        disabled={!ready || voting}
        onclick={() => vote(1)}
        ><svg
          aria-hidden="true"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="m5 12 4 4L19 6" /></svg
        >Upvote</button
      >
      <button
        type="button"
        class="vote-choice downvote"
        class:selected={discussion.my_vote === -1}
        aria-pressed={discussion.my_vote === -1}
        disabled={!ready || voting}
        onclick={() => vote(-1)}
        ><svg
          aria-hidden="true"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          ><circle cx="12" cy="12" r="8" /><path d="m6 6 12 12" /></svg
        >Downvote</button
      >
    </div>
    <p class="vote-help">
      Is this a useful issue worth highlighting? {discussion.my_vote
        ? 'Select your vote again to remove it.'
        : ''}
    </p>
    {#if voting}<p class="sr-only" role="status">Saving vote…</p>{/if}
    <div class="discussion-heading">
      <h3>Comments <span>{discussion.comment_count}</span></h3>
      <span class="anonymous-note">Everyone appears as Anonymous</span>
    </div>
    {#if signedIn}
      <form class="comment-composer" onsubmit={postComment}>
        <label class="sr-only" for={'comment-' + caseId}>Add a comment</label>
        <textarea
          id={'comment-' + caseId}
          bind:value={draft}
          placeholder="Add to the discussion…"
          rows="2"
          maxlength="2000"
          required
          disabled={posting}
          aria-describedby={'comment-help-' + caseId}></textarea>
        <div class="comment-composer-footer">
          <span id={'comment-help-' + caseId}>Your comment will be public.</span
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
          aria-label="Add a comment"
          placeholder="Sign in to add a comment…"
          rows="2"
          readonly></textarea>
        <div>
          <a href={signIn}>Sign in to comment</a><span
            >Anyone can read the discussion.</span
          >
        </div>
      </div>
    {/if}
    {#if notice}<p class="discussion-status" role="status">{notice}</p>{/if}
    {#if !comments.length}<p class="discussion-empty">
        No comments yet. Start the conversation.
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
  {:else}<p class="discussion-error">
      Voting and comments are temporarily unavailable.
    </p>{/if}
  {#if error}<p class="discussion-error" role="alert">{error}</p>{/if}
  {#if !discussion || error}<button
      type="button"
      class="comment-action"
      disabled={!ready || refreshing}
      onclick={retrySummary}
      >{refreshing ? 'Loading…' : 'Retry discussion'}</button
    >{/if}
</section>
<dialog
  class="confirm-dialog"
  bind:this={deleteDialog}
  aria-labelledby={'delete-comment-' + caseId}
>
  <h2 id={'delete-comment-' + caseId}>Delete your comment?</h2>
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
