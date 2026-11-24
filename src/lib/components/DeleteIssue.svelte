<script lang="ts">
  import { onMount } from 'svelte';
  let {
    id,
    description,
    disabled = false,
    onDeleted,
  }: {
    id: string;
    description: string;
    disabled?: boolean;
    onDeleted: () => void | Promise<void>;
  } = $props();
  let dialog: HTMLDialogElement;
  let ready = $state(false),
    busy = $state(false),
    message = $state('');
  onMount(() => (ready = true));
  async function remove(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    message = '';
    try {
      const response = await fetch('/api/issues/' + id + '/delete', {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? 'Could not delete this issue. Retry.',
        );
      dialog.close();
      await onDeleted();
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<button
  class="text-button danger-text"
  type="button"
  disabled={!ready || disabled || busy}
  onclick={() => {
    message = '';
    dialog.showModal();
  }}>Delete issue</button
>
<dialog
  bind:this={dialog}
  class="confirm-dialog"
  aria-labelledby={'delete-title-' + id}
  oncancel={(event) => {
    if (busy) event.preventDefault();
  }}
>
  <h2 id={'delete-title-' + id}>Delete this issue?</h2>
  <p class="citizen-text">
    {description.length > 200 ? description.slice(0, 200) + '…' : description}
  </p>
  <p>
    This permanently deletes the issue, votes, comments, and attached evidence.
  </p>
  {#if message}<p class="notice error" role="alert">{message}</p>{/if}
  {#if busy}<p role="status">Deleting issue…</p>{/if}
  <form onsubmit={remove}>
    <div class="dialog-actions">
      <button
        class="button secondary"
        type="button"
        disabled={busy}
        onclick={() => dialog.close()}>Keep issue</button
      >
      <button class="button danger" disabled={busy}
        >{busy ? 'Deleting…' : 'Delete issue'}</button
      >
    </div>
  </form>
</dialog>
