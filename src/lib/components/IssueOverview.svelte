<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { scale, fade } from 'svelte/transition';
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
  const max = $derived(
    Math.max(1, ...(overview?.topics?.map((c) => c.count) ?? [])),
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
      <figure class="principle-chart">
        <figcaption>
          <h3>Where ideas gather</h3>
          <p>Issues by topic. Pick a bubble to explore.</p>
        </figcaption>
        <div
          class="principle-bubbles topic-bubbles"
          aria-label="Issues by topic"
        >
          {#each overview.topics ?? [] as topic (topic.id)}
            <button
              type="button"
              class="principle-bubble topic-bubble"
              class:chosen={selectedTopic === topic.id}
              aria-pressed={selectedTopic === topic.id}
              aria-controls="selected-topic"
              style:--bubble-size={Math.max(
                52,
                126 * Math.sqrt(topic.count / max),
              ) + 'px'}
              aria-label={topic.name +
                ': ' +
                topic.count +
                (topic.count === 1 ? ' issue' : ' issues')}
              title={topic.name}
              in:scale={{ duration: reducedMotion ? 0 : 220, start: 0.85 }}
              onclick={() =>
                (selectedTopic = selectedTopic === topic.id ? null : topic.id)}
            >
              <span>{topic.name}</span><strong
                >{topic.count.toLocaleString('en')}</strong
              >
            </button>
          {:else}
            <p class="muted">Topics will appear as issues are shared.</p>
          {/each}
        </div>
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
      <figure class="behavior-chart">
        <figcaption>
          <h3>What stands out</h3>
          <!-- <p>Behavior labels from issue authors.</p> -->
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
