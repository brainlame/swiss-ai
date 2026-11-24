<script lang="ts">
  import { onMount } from 'svelte';
  let { onPublished }: { onPublished: () => Promise<void> } = $props();
  let dialog: HTMLDialogElement;
  let ready = $state(false),
    busy = $state(false),
    message = $state(''),
    success = $state('');
  onMount(() => {
    ready = true;
  });
  async function publish(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    message = '';
    success = '';
    try {
      const response = await fetch('/api/admin/synthesis', {
        method: 'POST',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message ??
            'The request could not finish. Refresh to check the current topics before retrying.',
        );
      success = `Published ${result.topics} topics for ${result.issues} issues.`;
      dialog.close();
      await onPublished();
    } catch (failure) {
      message = (failure as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<button
  class="button"
  type="button"
  disabled={!ready || busy}
  onclick={() => {
    message = '';
    dialog.showModal();
  }}>Synthesize cases</button
>
{#if success}<p class="notice success" role="status">{success}</p>{/if}
<dialog
  bind:this={dialog}
  class="confirm-dialog"
  aria-labelledby="synthesis-title"
  oncancel={(event) => {
    if (busy) event.preventDefault();
  }}
>
  <h2 id="synthesis-title">Synthesize cases</h2>
  <p>
    Generate fresh topics from all published issues? Descriptions and proposed
    changes are sent to a free AI provider after automatic privacy filtering.
    Filtering cannot catch every personal detail. Chat transcripts and
    screenshots are excluded.
  </p>
  <p>
    This replaces the topic list and assignments for all published issues. Keep
    this page open until the run finishes.
  </p>
  <form onsubmit={publish}>
    {#if message}<p class="notice error" role="alert">{message}</p>{/if}
    {#if busy}<div role="status">
        <p>Generating topics… This can take several minutes.</p>
        <progress aria-label="Topic synthesis in progress"></progress>
      </div>{/if}
    <div class="dialog-actions">
      <button
        class="button secondary"
        type="button"
        disabled={busy}
        onclick={() => dialog.close()}>Cancel</button
      >
      <button class="button" disabled={busy}
        >{busy ? 'Synthesizing…' : 'Synthesize cases'}</button
      >
    </div>
  </form>
</dialog>
