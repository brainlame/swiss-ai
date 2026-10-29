<script lang="ts">
  import CaseDiscussion from '#lib/components/CaseDiscussion.svelte';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { evidenceFor } from '#lib/chat-evidence.js';
  import { date, behaviorLabel } from '#lib/types.js';
  import ChatEvidence from '#lib/components/ChatEvidence.svelte';
  let { data, form } = $props();
  let confirmDialog: HTMLDialogElement;
  let imageDialog: HTMLDialogElement;
  let ready = $state(false);
  onMount(() => (ready = true));
  let selected = $state(0),
    deleting = $state(false);
  const transcript = $derived(evidenceFor(data.item));
  const constitution = $derived(
    data.constitutions.find((c) => c.number === data.item.constitution_number),
  );
  function enlarge(index: number) {
    selected = index;
    imageDialog.showModal();
  }
</script>

<svelte:head
  ><title
    >A citizen case · Constitution #{data.item.constitution_number} · AI Constitutions</title
  ></svelte:head
>
<div class="detail-layout">
  <div class="detail-main">
    <a class="back-link" href="/cases" data-sveltekit-preload-data="off">
      All Cases</a
    >
    <div class="detail-top">
      <span class="pill">Constitution #{data.item.constitution_number}</span
      ><span class="muted"
        >Anonymous · <time datetime={data.item.created_at}
          >{date(data.item.created_at)}</time
        ></span
      >
    </div>
    <h1>Case details</h1>
    <p class="behavior-label" class:good={data.item.behavior === 'good'}>
      {behaviorLabel(data.item.behavior)}
    </p>
    {#if transcript}<ChatEvidence {transcript} />{/if}
    {#if data.item.version > 2}<p class="helper">
        Updated {date(data.item.updated_at)}
      </p>{/if}
    {#if data.cleanupWarning}<p class="notice" role="status">
        Your changes were saved. Old image cleanup is pending and will be
        retried by scheduled housekeeping.
      </p>{/if}
    {#if form?.message}<p class="notice error" role="alert">
        {form.message}
      </p>{/if}
    {#if data.item.status === 'deleting'}<p class="notice error">
        This case is hidden while image deletion is pending. Retry deletion
        below.
      </p>{/if}
    <section class="detail-section">
      <h2>Description</h2>
      <p class="citizen-text">{data.item.description}</p>
    </section>
    <section class="detail-section proposal">
      <h2>Proposed constitutional improvement</h2>
      <p class="citizen-text">{data.item.improvement}</p>
    </section>
    {#if data.item.screenshots.length}<section class="detail-section">
        <h2>Chatbot screenshots</h2>
        <p class="helper">Select a screenshot to enlarge it.</p>
        <div class="evidence-grid">
          {#each data.item.screenshots as screenshot, i}<button
              class="evidence-button"
              disabled={!ready}
              onclick={() => enlarge(i)}
              aria-label={'Enlarge screenshot ' + (i + 1)}
              ><img
                src={screenshot.url}
                alt={'Chatbot screenshot ' + (i + 1)}
              /><span>Screenshot {i + 1} </span></button
            >{/each}
        </div>
      </section>{/if}
    {#if data.item.status === 'published'}<section
        class="detail-discussion-section"
        aria-labelledby="discussion-title"
      >
        <h2 id="discussion-title">Community discussion</h2>
        {#key data.item.id}<CaseDiscussion
            caseId={data.item.id}
            initial={data.discussion}
            signedIn={!!page.data.signedIn}
          />{/key}
      </section>{/if}
    {#if data.owns}<div class="owner-actions">
        <a class="button secondary" href={'/cases/' + data.item.id + '/edit'}
          >Edit case</a
        ><button
          class="text-button danger-text"
          disabled={!ready}
          onclick={() => confirmDialog.showModal()}>Delete case</button
        >
      </div>{/if}
  </div>
  <aside class="constitution-aside">
    <span class="pill">Constitution #{constitution?.number}</span>
    <h2>Referenced constitution</h2>
    <p>{constitution?.text}</p>
    <span class="sample-label">Sample content pending replacement</span><a
      href="/"
      >View all constitutions
    </a>
  </aside>
</div>
<dialog
  class="image-dialog"
  bind:this={imageDialog}
  aria-label="Enlarged screenshot"
>
  <button
    class="dialog-close icon-button"
    autofocus
    onclick={() => imageDialog.close()}
    aria-label="Close enlarged screenshot">✕</button
  >{#if data.item.screenshots[selected]}<img
      src={data.item.screenshots[selected].url}
      alt={'Enlarged chatbot screenshot ' + (selected + 1)}
    />{/if}
  <div class="image-controls">
    <button
      class="button secondary"
      disabled={selected === 0}
      onclick={() => selected--}>Previous</button
    ><span>{selected + 1} / {data.item.screenshots.length}</span><button
      class="button secondary"
      disabled={selected === data.item.screenshots.length - 1}
      onclick={() => selected++}>Next</button
    >
  </div>
</dialog>
<dialog
  bind:this={confirmDialog}
  class="confirm-dialog"
  aria-labelledby="delete-heading"
>
  <h2 id="delete-heading">Delete this case?</h2>
  <p>
    This removes your case and all its attached evidence. This action cannot be
    undone.
  </p>
  <form
    method="POST"
    action="?/delete"
    use:enhance={() => {
      deleting = true;
      return async ({ update }) => {
        await update();
        deleting = false;
        confirmDialog?.close();
      };
    }}
  >
    <div class="dialog-actions">
      <button
        type="button"
        class="button secondary"
        disabled={deleting}
        onclick={() => confirmDialog.close()}>Keep case</button
      ><button class="button danger" disabled={deleting}
        >{deleting ? 'Deleting…' : 'Delete case'}</button
      >
    </div>
  </form>
</dialog>
