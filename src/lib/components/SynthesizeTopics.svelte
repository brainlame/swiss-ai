<script lang="ts">
  import { onMount } from 'svelte';
  let { onPublished }: { onPublished: () => Promise<void> } = $props();
  let dialog: HTMLDialogElement;
  let ready = $state(false),
    busy = $state(false),
    message = $state(''),
    success = $state('');
  let file = $state<File | null>(null);
  onMount(() => {
    ready = true;
  });
  async function publish(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !file) return;
    busy = true;
    message = '';
    success = '';
    try {
      if (file.size > 500000)
        throw new Error('Choose a JSON approval file smaller than 500 KB.');
      const content = await file.text();
      try {
        JSON.parse(content);
      } catch {
        throw new Error(
          'This file is not valid JSON. Select your reviewed topic-approval.json file.',
        );
      }
      const response = await fetch('/api/admin/synthesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: content,
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
    Choose the reviewed approval file you use with the command-line job. Only
    approved, sanitized text is sent to OpenRouter.
  </p>
  <p>
    This replaces the topic list and assignments for all published issues. Keep
    this page open until the run finishes.
  </p>
  <form onsubmit={publish}>
    <label for="topic-approval">Reviewed approval file</label>
    <input
      id="topic-approval"
      type="file"
      accept=".json,application/json"
      required
      disabled={busy}
      onchange={(event) => {
        file = event.currentTarget.files?.[0] ?? null;
        message = '';
      }}
    />
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
      <button class="button" disabled={busy || !file}
        >{busy ? 'Synthesizing…' : 'Synthesize cases'}</button
      >
    </div>
  </form>
</dialog>
