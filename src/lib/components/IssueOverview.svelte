<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import type { IssueOverview } from '#lib/issue-overview.js';
  let {
    initial,
    refreshKey = 0,
    onrevision,
  }: {
    initial: IssueOverview | null;
    refreshKey?: number;
    onrevision: (revision: string) => void;
  } = $props();
  let overview = $state(untrack(() => initial));
  let delayed = $state(!untrack(() => initial)),
    live = $state(false),
    ready = $state(false),
    busy = $state(false);
  let reducedMotion = $state(false);
  let active = false,
    controller: AbortController | undefined;
  let stop: (() => void) | undefined;
  $effect(() => {
    overview = initial;
    delayed = !initial;
  });
  $effect(() => {
    void refreshKey;
    if (ready) untrack(() => void refresh());
  });
  async function refresh() {
    if (!active || busy) return;
    busy = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8000);
    try {
      const response = await fetch('/api/issues/overview', {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Overview unavailable');
      const result: IssueOverview = await response.json();
      if (!active) return;
      if (overview && BigInt(result.revision) < BigInt(overview.revision))
        return;
      if (result.revision !== overview?.revision) overview = result;
      delayed = false;
      onrevision(result.revision);
    } catch {
      if (active) delayed = true;
    } finally {
      clearTimeout(timeout);
      if (active) busy = false;
    }
  }
  onMount(() => {
    reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    active = true;
    ready = true;
    // Load the browser-only transport after hydration; SSR uses the same aggregate RPC.
    void import('#lib/issue-live.js')
      .then(({ watchIssueOverview }) => {
        if (active)
          stop = watchIssueOverview(
            () => void refresh(),
            (value) => {
              if (active) live = value;
            },
          );
      })
      .catch(() => {
        if (active) delayed = true;
      });
    return () => {
      active = false;
      stop?.();
      controller?.abort();
    };
  });
  let selectedTopic = $state<string | null>(null);
  const selected = $derived(
    overview?.topics?.find((t) => t.id === selectedTopic),
  );
  let topicPage = $state(0);
  const rankedTopics = $derived(
    [...(overview?.topics ?? [])].sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name, 'en') ||
        a.id.localeCompare(b.id),
    ),
  );
  const lastTopicPage = $derived(
    Math.max(0, Math.ceil(rankedTopics.length / 5) - 1),
  );
  const currentTopicPage = $derived(Math.min(topicPage, lastTopicPage));
  const topicOffset = $derived(currentTopicPage * 5);
  const visibleTopics = $derived(
    rankedTopics.slice(topicOffset, topicOffset + 5),
  );
  const segments = $derived(
    overview
      ? [
          { label: 'Wanted', value: overview.behaviors.good, key: 'good' },
          { label: 'Unwanted', value: overview.behaviors.bad, key: 'bad' },
          {
            label: 'Unclassified',
            value: overview.behaviors.unclassified,
            key: 'unclassified',
          },
        ]
      : [],
  );
</script>

<section class="issue-overview" aria-labelledby="overview-title">
  <div class="overview-heading">
    <h2 id="overview-title">The bigger picture</h2>
    <div class="overview-update">
      <span class="live-status" class:delayed role="status"
        ><i aria-hidden="true"></i>{delayed
          ? 'Updates delayed'
          : live
            ? 'Live'
            : 'Auto-updating'}</span
      >
      <button
        type="button"
        class="comment-action"
        disabled={!ready || busy}
        onclick={() => void refresh()}
        aria-label={delayed ? 'Retry overview' : 'Refresh overview'}
        >{busy ? 'Updating…' : delayed ? 'Retry' : 'Refresh'}</button
      >
    </div>
  </div>
  {#if overview}
    <div class="overview-charts">
      <figure class="topic-chart">
        <figcaption>
          <h3>Where ideas gather</h3>
          <p>Topics ranked by number of issues.</p>
        </figcaption>
        <ol
          class="topic-leaderboard"
          id="topic-leaderboard"
          start={topicOffset + 1}
          aria-label="Topic leaderboard"
          role="list"
        >
          {#each visibleTopics as topic, index (topic.id)}
            <li in:fly={{ y: 4, duration: reducedMotion ? 0 : 140 }}>
              <button
                type="button"
                class="topic-row"
                disabled={!ready}
                class:chosen={selectedTopic === topic.id}
                aria-pressed={selectedTopic === topic.id}
                aria-controls="selected-topic"
                aria-label={topic.name +
                  ': ' +
                  topic.count +
                  (topic.count === 1 ? ' issue' : ' issues')}
                onclick={() =>
                  (selectedTopic =
                    selectedTopic === topic.id ? null : topic.id)}
              >
                <span class="topic-rank" aria-hidden="true"
                  >{topicOffset + index + 1}</span
                >
                <span class="topic-name">{topic.name}</span>
                <strong class="topic-count"
                  >{topic.count.toLocaleString('en')}</strong
                >
              </button>
            </li>
          {:else}
            <li class="muted">Topics will appear as issues are shared.</li>
          {/each}
        </ol>
        {#if rankedTopics.length}
          <div class="topic-pagination">
            <span role="status" aria-live="polite" aria-atomic="true">
              {topicOffset + 1}–{Math.min(topicOffset + 5, rankedTopics.length)} of
              {rankedTopics.length} topics
            </span>
            <div class="topic-page-buttons">
              <button
                type="button"
                aria-label="Previous five topics"
                aria-controls="topic-leaderboard"
                disabled={!ready || currentTopicPage === 0}
                onclick={() => (topicPage = currentTopicPage - 1)}
                ><svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d="m6 15 6-6 6 6" /></svg
                ></button
              >
              <button
                type="button"
                aria-label="Next five topics"
                aria-controls="topic-leaderboard"
                disabled={!ready || currentTopicPage === lastTopicPage}
                onclick={() => (topicPage = currentTopicPage + 1)}
                ><svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
                ></button
              >
            </div>
          </div>
        {/if}
        <div id="selected-topic" aria-live="polite" aria-atomic="true">
          {#if selected}
            {#key selected.id}
              <div
                class="topic-detail"
                in:fade={{ duration: reducedMotion ? 0 : 160 }}
              >
                <strong>{selected.name}</strong>
                <span
                  >{selected.count}
                  {selected.count === 1 ? 'issue' : 'issues'}</span
                >
              </div>
            {/key}
          {/if}
        </div>
      </figure>
      <!-- What stands out (temporarily hidden)
      <figure class="behavior-chart">
        <figcaption>
          <h3>What stands out</h3>
          <p>Behavior labels from issue authors.</p>
        </figcaption>
        <div class="behavior-graphic">
          <div class="overview-donut">
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label={segments
                .map((s) => s.label + ': ' + s.value)
                .join(', ')}
            >
              <circle class="donut-track" cx="80" cy="80" r="64" />
              {#each segments as segment, i}
                <circle
                  class={'donut-segment ' + segment.key}
                  cx="80"
                  cy="80"
                  r="64"
                  pathLength="100"
                  stroke-dasharray={(overview.total
                    ? (segment.value / overview.total) * 100
                    : 0) + ' 100'}
                  stroke-dashoffset={overview.total
                    ? (-segments
                        .slice(0, i)
                        .reduce((sum, s) => sum + s.value, 0) /
                        overview.total) *
                      100
                    : 0}
                />
              {/each}
            </svg>
            <div class="donut-total">
              <strong>{overview.total.toLocaleString('en')}</strong><span
                >issues shared</span
              >
            </div>
          </div>
          <ul class="behavior-legend">
            {#each segments as segment}<li>
                <span class={'legend-dot ' + segment.key} aria-hidden="true"
                ></span><span>{segment.label}</span><strong
                  >{segment.value.toLocaleString('en')}</strong
                >
              </li>{/each}
          </ul>
        </div>
      </figure>
      -->
    </div>
    <!-- <p class="overview-caption">
      All published issues{overview.total === 0
        ? ' · Your first contribution starts the picture.'
        : ' · Bigger circles mean more issues.'}
    </p> -->
  {:else}
    <div class="overview-unavailable">
      <p>The overview is unavailable. You can still browse issues below.</p>
    </div>
  {/if}
</section>
