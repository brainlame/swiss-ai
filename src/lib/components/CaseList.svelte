<script lang="ts">
  import CaseDiscussion from '#lib/components/CaseDiscussion.svelte';
  import LineIcon from '#lib/components/LineIcon.svelte';
  import IssueOverview from '#lib/components/IssueOverview.svelte';
  import type {
    IssueOverview as Overview,
    RankingCursor,
  } from '#lib/issue-overview.js';
  import ConversationArt from '#lib/components/ConversationArt.svelte';
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import type { CaseSummary, Constitution } from '#lib/types.js';
  import { date, behaviorLabel } from '#lib/types.js';
  let {
    data,
  }: {
    data: {
      items: CaseSummary[];
      hasMore: boolean;
      query: string;
      mine: boolean;
      constitutions: Constitution[];
      overview?: Overview | null;
      revision?: string | null;
      topics?: { id: string; name: string }[];
      hasUnclassified?: boolean;
      nextCursor?: RankingCursor | null;
    };
  } = $props();
  let items = $state<CaseSummary[]>(untrack(() => data.items)),
    hasMore = $state(untrack(() => data.hasMore)),
    busy = $state(false),
    message = $state('');
  let revision = $state(untrack(() => data.revision ?? null));
  let latestRevision = $state<string | null>(null),
    forceStale = $state(false),
    activity = $state(0);
  let nextCursor = $state(untrack(() => data.nextCursor ?? null));
  let topics = $state(untrack(() => data.topics ?? []));
  let hasUnclassified = $state(untrack(() => data.hasUnclassified ?? false));
  const selectedTopic = $derived(page.url.searchParams.get('topic') ?? '');
  const rankingChanged = $derived(
    !data.mine &&
      (forceStale || (!!latestRevision && latestRevision !== revision)),
  );
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  let generation = 0;
  $effect(() => {
    const fresh = data;
    generation++;
    items = fresh.items;
    topics = fresh.topics ?? [];
    hasUnclassified = fresh.hasUnclassified ?? false;
    revision = fresh.revision ?? null;
    latestRevision = null;
    forceStale = false;
    nextCursor = fresh.nextCursor ?? null;
    hasMore = fresh.hasMore;
    message = '';
    busy = false;
  });
  const active = $derived(
    !!page.url.searchParams.get('q') ||
      !!page.url.searchParams.get('constitution') ||
      (!data.mine && !!selectedTopic) ||
      (data.mine && page.url.searchParams.get('sort') === 'oldest'),
  );
  async function more() {
    if (busy || !items.length || rankingChanged) return;
    busy = true;
    message = '';
    const current = generation;
    try {
      const params = new URLSearchParams(data.query);
      const last = items[items.length - 1];
      params.set('time', last.created_at);
      params.set('cursor', last.id);
      if (data.mine) params.set('mine', 'true');
      else if (nextCursor)
        for (const [key, value] of Object.entries(nextCursor))
          params.set(key, String(value));
      const response = await fetch('/api/issues?' + params);
      const result = await response.json();
      if (response.status === 409) {
        if (current === generation) forceStale = true;
        return;
      }
      if (!response.ok)
        throw new Error(result.message ?? 'Could not load more issues.');
      if (current !== generation) return;
      const ids = new Set(items.map((c) => c.id));
      items = [
        ...items,
        ...result.items.filter((c: CaseSummary) => !ids.has(c.id)),
      ];
      hasMore = result.hasMore;
      nextCursor = result.nextCursor;
    } catch (e) {
      if (current === generation)
        message = (e as Error).message + ' Try again.';
    } finally {
      if (current === generation) busy = false;
    }
  }
  async function refreshRanking() {
    if (busy) return;
    busy = true;
    message = '';
    const current = generation;
    try {
      const params = new URLSearchParams(data.query);
      for (const key of ['time', 'cursor', 'upvotes', 'revision'])
        params.delete(key);
      const response = await fetch('/api/issues?' + params);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Could not refresh issues.');
      if (current !== generation) return;
      items = result.items;
      topics = result.topics;
      hasUnclassified = result.hasUnclassified;
      hasMore = result.hasMore;
      nextCursor = result.nextCursor;
      revision = result.revision;
      latestRevision = result.revision;
      forceStale = false;
      activity++;
    } catch (e) {
      if (current === generation)
        message = (e as Error).message + ' Try again.';
    } finally {
      if (current === generation) busy = false;
    }
  }
</script>

<svelte:head
  ><title>{data.mine ? 'My Issues' : 'All Issues'} · AI Constitution</title
  ></svelte:head
>
<div class="page-heading issues-heading">
  <div>
    <h1>{data.mine ? 'My Issues' : 'All Issues'}</h1>
    <p>
      {data.mine
        ? 'Your contributions, in one place.'
        : 'Real observations. Ideas for better AI.'}
    </p>
  </div>
  <div class="issues-art"><ConversationArt /></div>
</div>
{#if page.url.searchParams.has('deleted')}<p
    class="notice success"
    role="status"
  >
    Issue deleted.
  </p>{/if}
{#if !data.mine}<IssueOverview
    initial={data.overview ?? null}
    constitutions={data.constitutions}
    refreshKey={activity}
    onrevision={(value) => {
      if (!revision || BigInt(value) >= BigInt(revision))
        latestRevision = value;
    }}
  />{/if}
<form
  class="filter-bar"
  method="GET"
  action={data.mine ? '/my-issues' : '/issues'}
>
  <div class="search-control">
    <label for="search">Search issues</label>
    <div class="search-input">
      <LineIcon name="search" size={19} /><input
        id="search"
        type="search"
        name="q"
        maxlength="200"
        placeholder="Find an issue…"
        value={page.url.searchParams.get('q') ?? ''}
      />
    </div>
  </div>
  <div>
    <label for="filter">Principle</label><select
      id="filter"
      name="constitution"
      value={page.url.searchParams.get('constitution') ?? ''}
      ><option value="">All principles</option
      >{#each data.constitutions as c}<option value={String(c.number)}
          >Principle #{c.number}</option
        >{/each}</select
    >
  </div>
  {#if !data.mine}
    <div>
      <label for="topic-filter">Topic</label>
      <select id="topic-filter" name="topic" value={selectedTopic}>
        <option value="">All topics</option>
        {#each topics as topic (topic.id)}
          <option value={topic.id}>{topic.name}</option>
        {/each}
        {#if hasUnclassified || selectedTopic === 'unclassified'}
          <option value="unclassified">Unclassified</option>
        {/if}
        {#if selectedTopic && selectedTopic !== 'unclassified' && !topics.some((topic) => topic.id === selectedTopic)}
          <option value={selectedTopic}>Unavailable topic</option>
        {/if}
      </select>
    </div>
  {/if}
  {#if data.mine}<div>
      <label for="sort">Sort by</label><select
        id="sort"
        name="sort"
        value={page.url.searchParams.get('sort') ?? 'newest'}
        ><option value="newest">Newest first</option><option value="oldest"
          >Oldest first</option
        ></select
      >
    </div>
  {/if}
  <button class="button" type="submit">Apply</button>{#if active}<a
      class="reset-link"
      href={data.mine ? '/my-issues' : '/issues'}>Reset filters</a
    >{/if}
</form>
<div class="results-heading">
  <span class="feed-label"
    ><LineIcon name={data.mine ? 'edit' : 'people'} size={19} />{data.mine
      ? 'Your contributions'
      : 'Trending issues'}</span
  >{#if !data.mine}<span class="ranking-note">Most wanted votes first</span
    >{:else}<a href="/chatbot">Open Chatbot</a>{/if}
</div>
{#if rankingChanged}<div class="ranking-refresh" role="status">
    <span>New activity. Refresh to see the latest issues.</span><button
      type="button"
      class="button secondary"
      disabled={busy}
      onclick={refreshRanking}>{busy ? 'Refreshing…' : 'Refresh issues'}</button
    >
  </div>{/if}
{#if items.length}<div
    class="case-grid discussion-feed"
    data-sveltekit-preload-data="false"
  >
    {#each items as item (item.id)}<article
        class="case-card discussion-card"
        aria-label="Citizen issue"
      >
        <div class="case-card-content">
          <div class="case-card-top">
            {#if item.is_sample}<span class="sample-label">Sample issue</span
              >{/if}
            <span class="pill">Principle #{item.constitution_number}</span><span
              class="behavior-label"
              class:good={item.behavior === 'good'}
              >{behaviorLabel(item.behavior)}</span
            >
          </div>
          <h2>
            <a
              href={item.status === 'deleting'
                ? '/issues/' + item.id + '/edit'
                : '/issues/' + item.id}
              >{item.description.length > 200
                ? item.description.slice(0, 200) + '…'
                : item.description}</a
            >
          </h2>
          <div class="case-proposal-preview">
            <span class="proposal-icon"><LineIcon name="edit" size={20} /></span
            >
            <div>
              <strong>Proposed change</strong>
              <p>
                {item.improvement.length > 250
                  ? item.improvement.slice(0, 250) + '…'
                  : item.improvement}
              </p>
            </div>
          </div>
          <div class="case-meta">
            <span>Anonymous</span><time datetime={item.created_at}
              >{date(item.created_at)}</time
            >
          </div>
          {#if item.status === 'deleting'}<p class="notice error">
              Deletion pending
            </p>
          {:else}<CaseDiscussion
              caseId={item.id}
              initial={item.discussion}
              sample={item.is_sample}
              signedIn={!!page.data.signedIn}
              onvote={() => activity++}
            />{/if}
          <div class="case-card-footer">
            {#if data.mine}<a
                class="manage-link"
                href={'/issues/' + item.id + '/edit'}
                >{item.status === 'deleting'
                  ? 'Retry deletion'
                  : 'Edit issue'}</a
              >{/if}
            <a
              class="button secondary open-issue"
              href={item.status === 'deleting'
                ? '/issues/' + item.id + '/edit'
                : '/issues/' + item.id}>Open issue</a
            >
          </div>
        </div>
      </article>{/each}
  </div>{:else}<div class="empty-state">
    <h2>
      {active
        ? 'No matching issues'
        : data.mine
          ? 'You haven’t submitted any issues.'
          : 'No issues yet.'}
    </h2>
    <p>
      {active
        ? 'Try a different search or principle.'
        : data.mine
          ? 'Your submitted issues will appear here.'
          : 'Start a conversation in Chatbot to contribute the first issue.'}
    </p>
    <a
      class="button"
      href={active ? (data.mine ? '/my-issues' : '/issues') : '/chatbot'}
      >{active ? 'Reset filters' : 'Open Chatbot'}</a
    >
  </div>{/if}
{#if message}<p class="notice error" role="alert">{message}</p>{/if}
{#if hasMore}<div class="load-more">
    <button
      class="button secondary"
      onclick={more}
      disabled={busy || !ready || rankingChanged}
      >{busy ? 'Loading more…' : 'Load more'}</button
    >
  </div>{/if}
