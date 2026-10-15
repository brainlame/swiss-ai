<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    validateFile,
    validateCount,
    validateText,
  } from '#lib/validation.js';
  import type { Constitution, CaseRecord } from '#lib/types.js';
  import ChatEvidence from '#lib/components/ChatEvidence.svelte';
  import {
    takeExchange,
    clearExchange,
    type ChatExchange,
  } from '#lib/chat-evidence.js';
  let {
    constitutions,
    item,
  }: { constitutions: Constitution[]; item?: CaseRecord } = $props();
  const initial = untrack(() => item);
  let exchange = $state<ChatExchange | null>(
    initial?.chat_prompt && initial.chat_response
      ? { prompt: initial.chat_prompt, response: initial.chat_response }
      : null,
  );
  let handoffMissing = $state(false);
  type Entry = { key: string; url: string; file?: File; path?: string };
  let description = $state(initial?.description ?? ''),
    improvement = $state(initial?.improvement ?? ''),
    constitution = $state(initial?.constitution_number ?? 0);
  let entries = $state<Entry[]>(
    initial?.screenshots.map((s) => ({
      key: s.storage_path,
      url: s.url,
      path: s.storage_path,
    })) ?? [],
  );
  let id = $state(initial?.id ?? ''),
    busy = $state(false),
    message = $state(''),
    progress = $state(0),
    stage = $state(''),
    done = $state('');
  let discardedPaths = $state<string[]>([]);
  let fileInput = $state<HTMLInputElement>();
  const ownedUrls = new Set<string>();
  const selected = $derived(
    constitutions.find((c) => c.number === constitution),
  );
  onMount(() => {
    if (!id) id = crypto.randomUUID();
    if (!item) {
      if (page.url.searchParams.get('source') === 'chatbot') {
        exchange = takeExchange();
        handoffMissing = !exchange;
      } else clearExchange();
      const n = Number(page.url.searchParams.get('constitution'));
      if (n >= 1 && n <= 11) constitution = n;
    }
  });
  onDestroy(() => ownedUrls.forEach((url) => URL.revokeObjectURL(url)));
  function addFiles(event: Event) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    message = '';
    try {
      validateCount(entries.length + files.length, !!exchange);
      files.forEach(validateFile);
      entries = [
        ...entries,
        ...files.map((file) => {
          const url = URL.createObjectURL(file);
          ownedUrls.add(url);
          return { key: crypto.randomUUID(), url, file };
        }),
      ];
    } catch (e) {
      message = (e as Error).message;
    }
    if (fileInput) fileInput.value = '';
  }
  function remove(key: string) {
    const entry = entries.find((e) => e.key === key);
    if (entry?.path) discardedPaths = [...discardedPaths, entry.path];
    if (entry?.file) {
      URL.revokeObjectURL(entry.url);
      ownedUrls.delete(entry.url);
    }
    entries = entries.filter((e) => e.key !== key);
  }
  async function api(body: unknown) {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message ?? 'The request failed. Please retry.');
    return data;
  }
  function upload(entry: Entry, index: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/uploads');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          progress = Math.round(
            ((index + e.loaded / e.total) / entries.length) * 90,
          );
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data.path);
          else
            reject(new Error(data.message ?? 'Upload failed. Please retry.'));
        } catch {
          reject(new Error('Upload failed. Check your connection and retry.'));
        }
      };
      xhr.onerror = () =>
        reject(
          new Error(
            'Connection interrupted. Your text is preserved; retry the upload.',
          ),
        );
      const form = new FormData();
      form.set('caseId', id);
      form.set('file', entry.file!);
      xhr.send(form);
    });
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    message = '';
    try {
      validateText(description, improvement, constitution);
      validateCount(entries.length, !!exchange);
    } catch (e) {
      message = (e as Error).message;
      return;
    }
    busy = true;
    progress = 0;
    const body = {
      id,
      description,
      improvement,
      constitution,
      version: item?.version ?? 1,
      discardedPaths,
      exchange,
    };
    try {
      stage = 'Preparing your case…';
      if (!item) await api({ ...body, stage: 'begin' });
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.file && !entry.path) {
          stage = `Uploading screenshot ${i + 1} of ${entries.length}…`;
          entry.path = await upload(entry, i);
        }
      }
      stage = 'Saving your case…';
      progress = 95;
      const result = await api({
        ...body,
        paths: entries.map((e) => e.path),
        stage: 'commit',
      });
      progress = 100;
      done =
        '/cases/' + result.id + (result.cleanupWarning ? '?cleanup=1' : '');
      stage = 'Saved successfully.';
      await goto(done);
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if item?.status === 'deleting'}<div class="notice error" role="alert">
    This case is hidden while deletion is pending. Retry to finish removing its
    images.
  </div>
  <form action={'/cases/' + item.id + '?/delete'} method="POST">
    <button class="button danger">Retry deletion</button>
  </form>
{:else}
  <form class="case-form" onsubmit={submit}>
    {#if exchange}<ChatEvidence {exchange} />
      <p class="notice">
        This exchange will be public. If it contains identifying information,
        return to the <a href="/chatbot">Chatbot</a> and use an anonymized prompt
        before creating a case.
      </p>
    {:else if handoffMissing}<p class="notice" role="status">
        The selected exchange is no longer available after leaving or refreshing
        this form. <a href="/chatbot">Return to Chatbot</a> to select a new exchange,
        or attach screenshots below.
      </p>{/if}
    <section class="form-section" aria-label="Evidence">
      <div class="field-body">
        <label id="screenshots-label" for="screenshots"
          >Chatbot screenshots <span class="required" aria-hidden="true"
            >{exchange ? 'Optional' : 'Required'}</span
          ></label
        >
        <p id="screenshot-help" class="helper">
          {exchange
            ? 'Your attached exchange provides evidence. Add up to 5 screenshots if useful.'
            : 'Add 1–5 screenshots.'} PNG, JPEG, or WebP; maximum 10 MB per image.
        </p>
        <div class="privacy-note" id="privacy-note">
          <p>
            Anonymize your screenshots before uploading. Remove names, email
            addresses, and other identifying information. Your case and
            screenshots will be publicly visible.
          </p>
        </div>
        <div class="upload-area">
          <span class="muted">Choose screenshots from your device.</span><input
            bind:this={fileInput}
            id="screenshots"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onchange={addFiles}
            disabled={busy || entries.length >= 5}
            aria-describedby="screenshot-help privacy-note"
          />
        </div>
        {#if entries.length}<div class="preview-grid">
            {#each entries as entry, i (entry.key)}<div class="preview">
                <img
                  src={entry.url}
                  alt={'Selected screenshot ' + (i + 1)}
                /><button
                  type="button"
                  class="remove-image"
                  disabled={busy}
                  onclick={() => remove(entry.key)}
                  aria-label={'Remove screenshot ' + (i + 1)}>✕</button
                ><span>{i + 1} of {entries.length}</span>
              </div>{/each}
          </div>{/if}
      </div>
    </section>
    <section class="form-section" aria-label="Case context">
      <div class="field-body">
        <label id="description-label" for="description"
          >Description <span class="required" aria-hidden="true">Required</span
          ></label
        >
        <p class="helper" id="description-help">
          What happened, and why does it matter? Good, problematic, and mixed
          examples are all welcome.
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
    {#if message}<div class="notice error" role="alert">{message}</div>{/if}
    {#if busy}<div class="upload-progress" role="status">
        <p>{stage}</p>
        <progress value={progress} max="100" aria-label="Submission progress"
          >{progress}%</progress
        >
      </div>{/if}
    {#if done}<p class="notice success" role="status">
        Your case is saved. <a href={done}>Open your case</a>
      </p>{/if}
    <div class="form-footer">
      <p class="muted">
        Your case will be public.<br />Your account details will stay private.
      </p>
      <button class="button" type="submit" disabled={busy || !!done}
        >{busy ? 'Saving…' : item ? 'Save changes' : 'Submit case'}
      </button>
    </div>
  </form>
{/if}
