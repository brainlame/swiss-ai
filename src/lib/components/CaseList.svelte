<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import type { CaseRecord, Constitution } from '#lib/types.js';
  import { date } from '#lib/types.js';
  let {
    data,
  }: {
    data: {
      items: CaseRecord[];
      hasMore: boolean;
      query: string;
      mine: boolean;
      constitutions: Constitution[];
    };
  } = $props();
  let items = $state<CaseRecord[]>(untrack(() => data.items)),
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
        ...result.items.filter((c: CaseRecord) => !ids.has(c.id)),
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
      : 'Browse submitted chatbot examples and proposed changes to the constitutions.'}
  </p>
</div>
{#if page.url.searchParams.has('deleted')}<p
    class="notice success"
    role="status"
  >
    Your case and its screenshots have been deleted.
  </p>{/if}
{#if page.url.searchParams.has('password')}<p
    class="notice success"
    role="status"
  >
    Your password has been updated.
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
  <span>{data.mine ? 'Your cases' : 'Citizen cases'}</span><a href="/submit"
    >Submit a case
  </a>
</div>
{#if items.length}<div class="case-grid">
    {#each items as item (item.id)}<article class="case-card">
        {#if item.screenshots[0]?.url}<a
            class="case-thumbnail"
            href={item.status === 'deleting'
              ? '/cases/' + item.id + '/edit'
              : '/cases/' + item.id}
            tabindex="-1"
            aria-hidden="true"
            ><img src={item.screenshots[0].url} alt="" loading="lazy" /></a
          >{/if}
        <div class="case-card-content">
          <span class="pill">Constitution #{item.constitution_number}</span
          >{#if item.status === 'deleting'}<p class="notice error">
              Deletion pending
            </p>{/if}
          <h2>
            <a
              href={item.status === 'deleting'
                ? '/cases/' + item.id + '/edit'
                : '/cases/' + item.id}
              >{item.description.length > 130
                ? item.description.slice(0, 130) + '…'
                : item.description}</a
            >
          </h2>
          <div class="case-meta">
            <span>Anonymous</span><time datetime={item.created_at}
              >{date(item.created_at)}</time
            >
          </div>
          {#if data.mine}<a
              class="manage-link"
              href={'/cases/' + item.id + '/edit'}
              >{item.status === 'deleting' ? 'Retry deletion' : 'Edit case'}
            </a>{/if}
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
          : 'Submit a chatbot example and suggest an improvement.'}
    </p>
    <a
      class="button"
      href={active ? (data.mine ? '/my-cases' : '/cases') : '/submit'}
      >{active ? 'Reset filters' : 'Submit a Case'}</a
    >
  </div>{/if}
{#if message}<p class="notice error" role="alert">{message}</p>{/if}
{#if hasMore}<div class="load-more">
    <button class="button secondary" onclick={more} disabled={busy || !ready}
      >{busy ? 'Loading more…' : 'Load more'}</button
    >
  </div>{/if}
