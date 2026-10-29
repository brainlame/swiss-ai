<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goto, beforeNavigate } from '$app/navigation';
  import {
    validateText,
    validateTranscript,
    validateBehavior,
  } from '#lib/validation.js';
  import type { Constitution, CaseRecord } from '#lib/types.js';
  import ChatEvidence from '#lib/components/ChatEvidence.svelte';
  import {
    takeConversation,
    issueDraft,
    rememberIssueDraft,
    discardIssueFlow,
    evidenceFor,
    type Transcript,
  } from '#lib/chat-evidence.js';
  let {
    constitutions,
    item,
  }: { constitutions: Constitution[]; item?: CaseRecord } = $props();
  const initial = untrack(() => item);
  let transcript = $state<Transcript | null>(initial?.transcript ?? null);
  let description = $state(initial?.description ?? ''),
    improvement = $state(initial?.improvement ?? ''),
    constitution = $state(initial?.constitution_number ?? 0);
  let behavior = $state<'good' | 'bad' | ''>(
    initial ? (initial.behavior ?? '') : 'bad',
  );
  let id = $state(initial?.id ?? ''),
    busy = $state(false),
    ready = $state(false),
    message = $state(''),
    done = $state('');
  const selected = $derived(
    constitutions.find((c) => c.number === constitution),
  );
  const evidence = $derived(item ? evidenceFor(item) : transcript);
  onMount(() => {
    if (!item) {
      transcript = takeConversation();
      if (!transcript) {
        void goto('/chatbot?evidence=missing', { replace: true });
        return;
      }
      const saved = issueDraft();
      if (saved) {
        description = saved.description;
        improvement = saved.improvement;
        constitution = saved.constitution;
        behavior = saved.behavior;
      }
      id = saved?.id || crypto.randomUUID();
    }
    ready = true;
  });
  beforeNavigate(({ to }) => {
    if (!item && ready && to?.url.pathname === '/chatbot')
      rememberIssueDraft({
        id,
        description,
        improvement,
        constitution,
        behavior,
      });
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    message = '';
    try {
      validateText(description, improvement, constitution);
      validateBehavior(behavior);
      if (!item) validateTranscript(transcript);
    } catch (e) {
      message = (e as Error).message;
      return;
    }
    busy = true;
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          description,
          improvement,
          constitution,
          behavior,
          transcript,
          version: item?.version ?? 1,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Could not save. Please retry.');
      done = '/issues/' + result.id;
      if (!item) discardIssueFlow();
      await goto(done);
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if item?.status === 'deleting'}
  <p class="notice error" role="alert">
    This issue is hidden while deletion is pending. Retry to finish removing its
    evidence.
  </p>
  <form action={'/issues/' + item.id + '?/delete'} method="POST">
    <button class="button danger">Retry deletion</button>
  </form>
{:else if !item && !ready}
  <p class="notice" role="status">
    Opening your conversation snapshot… If it is unavailable, <a href="/chatbot"
      >return to Chatbot</a
    > to start an issue.
  </p>
{:else}
  <form class="case-form" onsubmit={submit}>
    {#if evidence}<ChatEvidence
        transcript={evidence}
        onback={!item ? () => goto('/chatbot') : undefined}
        backDisabled={busy}
      />
      <p class="notice">
        Only the attached selection will be public. If it contains identifying
        information, return to <a href="/chatbot">Chatbot</a> and use anonymized messages
        before starting an issue.
      </p>
    {/if}
    {#if item?.screenshots.length}<section
        class="form-section"
        aria-label="Historical evidence"
      >
        <h2>Existing screenshots</h2>
        <p class="helper">Your original evidence is preserved.</p>
        <div class="evidence-grid">
          {#each item.screenshots as image, i}<a
              href={image.url}
              target="_blank"
              rel="noreferrer"
              ><img
                src={image.url}
                alt={'Historical screenshot ' + (i + 1)}
              /></a
            >{/each}
        </div>
      </section>{/if}
    <section class="form-section" aria-label="Behavior classification">
      <fieldset class="behavior-options" disabled={busy}>
        <legend>Behavior <span class="required">Required</span></legend>
        <p class="helper" id="behavior-help">
          Does this example show behavior you want the model to exhibit, or
          behavior you want it to avoid?
        </p>
        <label
          ><input
            type="radio"
            name="behavior"
            value="bad"
            bind:group={behavior}
            required
            aria-describedby="behavior-help"
          /> Bad / unwanted behavior</label
        >
        <label
          ><input
            type="radio"
            name="behavior"
            value="good"
            bind:group={behavior}
            required
            aria-describedby="behavior-help"
          /> Good / wanted behavior</label
        >
        {#if initial && !initial.behavior}<p class="helper">
            This historical issue is unclassified. Choose a classification to
            save your changes.
          </p>{/if}
      </fieldset>
    </section>
    <section class="form-section" aria-label="Issue context">
      <div class="field-body">
        <label id="description-label" for="description"
          >Description <span class="required" aria-hidden="true">Required</span
          ></label
        >
        <p class="helper" id="description-help">
          What happened, and why does it matter? Explain which parts of the
          conversation support your issue.
        </p>
        <textarea
          id="description"
          bind:value={description}
          required
          maxlength="10000"
          rows="6"
          disabled={busy}
          aria-describedby="description-help"
          placeholder="Describe the chatbot interaction and what stood out to you…"
        ></textarea>
      </div>
    </section>
    <section class="form-section" aria-label="Suggested change">
      <div class="field-body">
        <label id="improvement-label" for="improvement"
          >Proposed constitutional improvement <span
            class="required"
            aria-hidden="true">Required</span
          ></label
        >
        <p class="helper" id="improvement-help">
          Suggest a concrete change to the principle and explain why your
          example supports it.
        </p>
        <textarea
          id="improvement"
          bind:value={improvement}
          required
          maxlength="10000"
          rows="6"
          disabled={busy}
          aria-describedby="improvement-help"
          placeholder="I propose changing this constitution to… because…"
        ></textarea>
      </div>
    </section>
    <section class="form-section" aria-label="Principle selection">
      <div class="field-body">
        <label id="constitution-label" for="constitution"
          >Constitution being addressed <span
            class="required"
            aria-hidden="true">Required</span
          ></label
        >
        <p class="helper">
          Choose the one sample principle your proposal addresses.
        </p>
        <select
          id="constitution"
          bind:value={constitution}
          required
          disabled={busy}
          ><option value={0} disabled>Select a constitution</option
          >{#each constitutions as c}<option value={c.number}
              >Constitution #{c.number}</option
            >{/each}</select
        >{#if selected}<div class="selected-constitution">
            <span class="pill">Constitution #{selected.number}</span><span
              class="sample-label">Sample content</span
            >
            <p>{selected.text}</p>
          </div>{/if}
      </div>
    </section>

    {#if message}<p class="notice error" role="alert">{message}</p>{/if}
    {#if busy}<p role="status">Saving your issue…</p>{/if}
    {#if done}<p class="notice success" role="status">
        Your issue is saved. <a href={done}>Open your issue</a>
      </p>{/if}
    <div class="form-footer">
      <p class="muted">
        Your issue will be public.<br />Your account details stay private.
      </p>
      <button class="button" disabled={busy || !!done || !ready}
        >{busy ? 'Saving…' : item ? 'Save changes' : 'Submit issue'}</button
      >
    </div>
  </form>
{/if}
