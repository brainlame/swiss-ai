<script lang="ts">
  import CaseDiscussion from '#lib/components/CaseDiscussion.svelte';
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
    };
  } = $props();
  let items = $state<CaseSummary[]>(untrack(() => data.items)),
    hasMore = $state(untrack(() => data.hasMore)),
    busy = $state(false),
    message = $state('');
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  let generation = 0;
  $effect(() => {
    const fresh = data;
    generation++;
    items = fresh.items;
    hasMore = fresh.hasMore;
    message = '';
    busy = false;
  });
  const active = $derived(
    !!page.url.searchParams.get('q') ||
      !!page.url.searchParams.get('constitution') ||
      page.url.searchParams.get('sort') === 'oldest',
  );
  async function more() {
    if (busy || !items.length) return;
    busy = true;
    message = '';
    const current = generation;
    try {
      const params = new URLSearchParams(data.query);
      const last = items[items.length - 1];
      params.set('time', last.created_at);
      params.set('cursor', last.id);
      if (data.mine) params.set('mine', 'true');
      const response = await fetch('/api/cases?' + params);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Could not load more cases.');
      if (current !== generation) return;
      const ids = new Set(items.map((c) => c.id));
      items = [
        ...items,
        ...result.items.filter((c: CaseSummary) => !ids.has(c.id)),
      ];
      hasMore = result.hasMore;
    } catch (e) {
      if (current === generation)
        message = (e as Error).message + ' Try again.';
    } finally {
      if (current === generation) busy = false;
    }
  }
</script>

<svelte:head
  ><title>{data.mine ? 'My Cases' : 'All Cases'} · AI Constitutions</title
  ></svelte:head
>
<div class="page-heading">
  <h1>{data.mine ? 'My Cases' : 'All Cases'}</h1>
  <p>
    {data.mine
      ? 'View and manage the cases you’ve contributed.'
      : 'Discover chatbot examples, highlight useful cases, and join the discussion.'}
  </p>
</div>
{#if page.url.searchParams.has('deleted')}<p
    class="notice success"
    role="status"
  >
    Your case and its evidence have been deleted.
  </p>{/if}
<form
  class="filter-bar"
  method="GET"
  action={data.mine ? '/my-cases' : '/cases'}
>
  <div class="search-control">
    <label for="search">Search cases</label><input
      id="search"
      type="search"
      name="q"
      maxlength="200"
      placeholder="Search descriptions and proposals…"
      value={page.url.searchParams.get('q') ?? ''}
    />
  </div>
  <div>
    <label for="filter">Constitution</label><select
      id="filter"
      name="constitution"
      value={page.url.searchParams.get('constitution') ?? ''}
      ><option value="">All constitutions</option
      >{#each data.constitutions as c}<option value={String(c.number)}
          >Constitution #{c.number}</option
        >{/each}</select
    >
  </div>
  <div>
    <label for="sort">Sort by</label><select
      id="sort"
      name="sort"
      value={page.url.searchParams.get('sort') ?? 'newest'}
      ><option value="newest">Newest first</option><option value="oldest"
        >Oldest first</option
      ></select
    >
  </div>
  <button class="button" type="submit">Apply</button>{#if active}<a
      class="reset-link"
      href={data.mine ? '/my-cases' : '/cases'}>Reset filters</a
    >{/if}
</form>
<div class="results-heading">
  <span>{data.mine ? 'Your cases' : 'Citizen cases'}</span><a href="/chatbot"
    >Open Chatbot
  </a>
</div>
{#if items.length}<div
    class="case-grid discussion-feed"
    data-sveltekit-preload-data="off"
  >
    {#each items as item (item.id)}<article
        class="case-card discussion-card"
        aria-label="Citizen case"
      >
        <div class="case-card-content">
          <div class="case-card-top">
            <span class="pill">Constitution #{item.constitution_number}</span
            ><span class="behavior-label" class:good={item.behavior === 'good'}
              >{behaviorLabel(item.behavior)}</span
            >
          </div>
          <h2>
            <a
              href={item.status === 'deleting'
                ? '/cases/' + item.id + '/edit'
                : '/cases/' + item.id}
              >{item.description.length > 100
                ? item.description.slice(0, 100) + '…'
                : item.description}</a
            >
          </h2>
          {#if item.description.length > 100}<p
              class="case-description-preview"
            >
              {item.description.length > 600
                ? item.description.slice(0, 600) + '…'
                : item.description}
            </p>{/if}
          <div class="case-proposal-preview">
            <strong>Proposed improvement</strong>
            <p>
              {item.improvement.length > 250
                ? item.improvement.slice(0, 250) + '…'
                : item.improvement}
            </p>
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
              signedIn={!!page.data.signedIn}
            />{/if}
          <div class="case-card-footer">
            {#if data.mine}<a
                class="manage-link"
                href={'/cases/' + item.id + '/edit'}
                >{item.status === 'deleting'
                  ? 'Retry deletion'
                  : 'Edit case'}</a
              >{/if}
            <a
              class="button secondary open-case"
              href={item.status === 'deleting'
                ? '/cases/' + item.id + '/edit'
                : '/cases/' + item.id}>Open case</a
            >
          </div>
        </div>
      </article>{/each}
  </div>{:else}<div class="empty-state">
    <h2>
      {active
        ? 'No matching cases'
        : data.mine
          ? 'You haven’t submitted any cases.'
          : 'No cases yet.'}
    </h2>
    <p>
      {active
        ? 'Try a different search or constitution.'
        : data.mine
          ? 'Your submitted cases will appear here.'
          : 'Start a conversation in Chatbot to contribute the first case.'}
    </p>
    <a
      class="button"
      href={active ? (data.mine ? '/my-cases' : '/cases') : '/chatbot'}
      >{active ? 'Reset filters' : 'Open Chatbot'}</a
    >
  </div>{/if}
{#if message}<p class="notice error" role="alert">{message}</p>{/if}
{#if hasMore}<div class="load-more">
    <button class="button secondary" onclick={more} disabled={busy || !ready}
      >{busy ? 'Loading more…' : 'Load more'}</button
    >
  </div>{/if}
