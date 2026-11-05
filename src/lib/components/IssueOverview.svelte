<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import type { Constitution } from '#lib/types.js';
  import type { IssueOverview } from '#lib/issue-overview.js';
  let {
    initial,
    constitutions,
    refreshKey = 0,
    onrevision,
  }: {
    initial: IssueOverview | null;
    constitutions: Constitution[];
    refreshKey?: number;
    onrevision: (revision: string) => void;
  } = $props();
  let overview = $state(untrack(() => initial));
  let delayed = $state(!untrack(() => initial)),
    live = $state(false),
    ready = $state(false),
    busy = $state(false);
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
  const max = $derived(
    Math.max(1, ...(overview?.constitutions.map((c) => c.count) ?? [])),
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
  function link(number: number) {
    const params = new URLSearchParams(page.url.searchParams.toString());
    for (const key of ['cursor', 'time', 'upvotes', 'revision', 'sort'])
      params.delete(key);
    if (params.get('constitution') === String(number))
      params.delete('constitution');
    else params.set('constitution', String(number));
    return '/issues' + (params.size ? '?' + params : '');
  }
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
          <p>Issues by constitution. Pick a circle to explore.</p>
        </figcaption>
        <div class="principle-bubbles" aria-label="Issues by constitution">
          {#each overview.constitutions as c (c.number)}
            <a
              class="principle-bubble"
              href={link(c.number)}
              class:chosen={page.url.searchParams.get('constitution') ===
                String(c.number)}
              style:--bubble-size={44 + 30 * Math.sqrt(c.count / max) + 'px'}
              aria-label={'Constitution #' +
                c.number +
                ': ' +
                c.count +
                (c.count === 1 ? ' issue' : ' issues') +
                '. Filter issues.'}
              aria-current={page.url.searchParams.get('constitution') ===
              String(c.number)
                ? 'true'
                : undefined}
              title={'Constitution #' +
                c.number +
                ': ' +
                (constitutions.find((p) => p.number === c.number)?.text ?? '')}
            >
              <span>#{c.number}</span><strong
                >{c.count.toLocaleString('en')}</strong
              >
            </a>
          {/each}
        </div>
      </figure>
      <figure class="behavior-chart">
        <figcaption>
          <h3>What stands out</h3>
          <p>Behavior people want to keep or change.</p>
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
    <p class="overview-caption">
      All published issues{overview.total === 0
        ? ' · Your first contribution starts the picture.'
        : ' · Bigger circles mean more issues.'}
    </p>
  {:else}
    <div class="overview-unavailable">
      <p>The overview is unavailable. You can still browse issues below.</p>
    </div>
  {/if}
</section>
