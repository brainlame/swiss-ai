<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type {
    Comment,
    Discussion,
    DiscussionSide,
    Vote,
  } from '#lib/discussion.js';
  import CommentThread from '#lib/components/CommentThread.svelte';
  let {
    caseId,
    initial,
    signedIn,
    onvote,
    sample = false,
  }: {
    caseId: string;
    initial: Discussion | null;
    signedIn: boolean;
    sample?: boolean;
    onvote?: () => void;
  } = $props();
  let discussion = $state<Discussion | null>(untrack(() => initial));
  let side = $state<DiscussionSide>(
    untrack(() => (initial?.my_vote === -1 ? 'unwanted' : 'wanted')),
  );
  let ready = $state(false),
    voting = $state(false),
    refreshing = $state(false),
    error = $state('');
  $effect(() => {
    discussion = initial;
  });
  let now = $state(Date.now());
  onMount(() => {
    ready = true;
    const timer = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(timer);
  });
  const endpoint = $derived('/api/issues/' + caseId + '/discussion');
  const totalVotes = $derived(
    discussion?.total_votes ??
      (discussion?.upvotes ?? 0) + (discussion?.downvotes ?? 0),
  );
  const totalComments = $derived(
    discussion?.total_comments ??
      (discussion?.comment_count ?? 0) +
        (discussion?.threads.wanted.comment_count ?? 0) +
        (discussion?.threads.unwanted.comment_count ?? 0),
  );
  const upPercent = $derived(
    totalVotes ? Math.round((discussion!.upvotes / totalVotes) * 100) : 0,
  );
  const signIn = $derived(
    '/signin?next=' + encodeURIComponent(page.url.pathname + page.url.search),
  );
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
    try {
      await mutate({ action: 'vote', value: selected });
      if (!selected) discussion.my_vote = 0;
      onvote?.();
      try {
        const saved = await read<Discussion>();
        discussion = saved;
        if (selected) side = selected === 1 ? 'wanted' : 'unwanted';
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
</script>

<section class="case-discussion" aria-label="Issue voting and discussion">
  {#if discussion}
    {#if discussion.my_vote}
      <div
        class="vote-bar"
        role="img"
        aria-label={`${discussion.upvotes} wanted votes and ${discussion.downvotes} unwanted votes`}
      >
        <span class="vote-bar-up" style:width={`${totalVotes ? upPercent : 0}%`}
        ></span>
        <span
          class="vote-bar-down"
          style:width={`${totalVotes ? 100 - upPercent : 0}%`}
        ></span>
      </div>
    {/if}
    <div class="vote-summary">
      <span>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
      <span>{totalComments} {totalComments === 1 ? 'comment' : 'comments'}</span
      >
      {#if discussion.my_vote}<span class="upvote-count"
          >{discussion.upvotes} wanted · {upPercent}%</span
        ><span class="downvote-count"
          >{discussion.downvotes} unwanted · {totalVotes
            ? 100 - upPercent
            : 0}%</span
        >
      {/if}
    </div>
    <div
      class="vote-choices"
      role="group"
      aria-label="How would you classify this behavior?"
    >
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
          stroke-linejoin="round"
          ><path
            d="M7 10v11H3V10h4Zm0 10h11a2 2 0 0 0 2-1.6l1-6A2 2 0 0 0 19 10h-5l.8-4.3A2.3 2.3 0 0 0 12.5 3L7 10"
          /></svg
        >Wanted behavior</button
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
          ><path
            transform="rotate(180 12 12)"
            d="M7 10v11H3V10h4Zm0 10h11a2 2 0 0 0 2-1.6l1-6A2 2 0 0 0 19 10h-5l.8-4.3A2.3 2.3 0 0 0 12.5 3L7 10"
          /></svg
        >Unwanted behavior</button
      >
    </div>
    <p class="vote-help">
      {sample ? 'Totals include sample votes.' : 'Vote on the AI behavior.'}
      {discussion.my_vote
        ? 'Select again to undo.'
        : 'Vote to see results and discussion.'}
    </p>
    {#if voting}<p class="sr-only" role="status">Saving vote…</p>{/if}
    {#if discussion.my_vote}
      <div class="reason-switch" role="group" aria-label="Reason threads">
        <button
          type="button"
          aria-pressed={side === 'wanted'}
          onclick={() => (side = 'wanted')}>Wanted reasons</button
        >
        <button
          type="button"
          aria-pressed={side === 'unwanted'}
          onclick={() => (side = 'unwanted')}>Unwanted reasons</button
        >
        {#if discussion.comment_count || discussion.root_count}
          <button
            type="button"
            aria-pressed={side === 'general'}
            onclick={() => (side = 'general')}>Earlier discussion</button
          >
        {/if}
      </div>
      <div hidden={side !== 'wanted'}>
        <CommentThread
          {caseId}
          initial={discussion.threads.wanted}
          side="wanted"
          {signedIn}
          {now}
          {ready}
          {signIn}
          {read}
          {mutate}
        />
      </div>
      <div hidden={side !== 'unwanted'}>
        <CommentThread
          {caseId}
          initial={discussion.threads.unwanted}
          side="unwanted"
          {signedIn}
          {now}
          {ready}
          {signIn}
          {read}
          {mutate}
        />
      </div>
      {#if discussion.comment_count || discussion.root_count}
        <div hidden={side !== 'general'}>
          <CommentThread
            {caseId}
            initial={discussion}
            side="general"
            {signedIn}
            {now}
            {ready}
            {signIn}
            {read}
            {mutate}
          />
        </div>
      {/if}
    {/if}
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
