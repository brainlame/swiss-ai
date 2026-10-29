<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { selectReply, type ChatMessage } from '#lib/chatbot.js';
  import { chatbotHints } from '#lib/chatbot-hints.js';
  import {
    attachConversation,
    clearConversation,
    returnToConversation,
    selectConversation,
  } from '#lib/chat-evidence.js';

  import { page } from '$app/state';
  import { validateTranscript } from '#lib/validation.js';

  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
  let sending = $state(false);
  let ready = $state(false);
  let viewportHeight = $state<number>();
  let conversation: HTMLDivElement;
  let composer = $state<HTMLTextAreaElement>();
  let nearBottom = true;
  let mobileInput = $state(false);
  let active = true;
  let hintsDialog: HTMLDialogElement;
  let openingCase = $state(false);
  let caseError = $state('');
  let selecting = $state(false),
    startExchange = $state(-1),
    endExchange = $state(-1);
  const exchanges = $derived(messages.filter((m) => m.role === 'user'));
  const selectedCount = $derived(
    selecting && startExchange >= 0 ? (endExchange - startExchange + 1) * 2 : 0,
  );
  function beginSelection() {
    if (sending || !exchanges.length) return;
    if (startExchange < 0) startExchange = endExchange = exchanges.length - 1;
    selecting = true;
    caseError = '';
  }
  function setStart(event: Event) {
    startExchange = Number((event.target as HTMLSelectElement).value);
    if (endExchange < startExchange) endExchange = startExchange;
    void revealExchange(startExchange);
  }
  function setEnd(event: Event) {
    endExchange = Number((event.target as HTMLSelectElement).value);
    if (startExchange > endExchange) startExchange = endExchange;
    void revealExchange(endExchange);
  }
  async function revealExchange(index: number) {
    await tick();
    conversation
      ?.querySelector<HTMLElement>('[data-exchange="' + index + '"]')
      ?.scrollIntoView({ block: 'nearest' });
    nearBottom = false;
  }

  async function createCase() {
    if (openingCase || sending || !messages.length) return;
    caseError = '';
    const range = { start: startExchange, end: endExchange };
    try {
      validateTranscript(selectConversation(messages, range));
    } catch (e) {
      caseError = (e as Error).message;
      return;
    }
    openingCase = true;
    // Freeze just the continuous selection; keep the full chat only for Back to chat.
    attachConversation(messages, range, draft);
    try {
      await goto('/submit?source=chatbot');
    } catch {
      caseError = 'The issue form could not be opened. Please try again.';
    } finally {
      clearConversation();
      openingCase = false;
    }
  }

  function resetConversation() {
    active = false;
    messages = [];
    draft = '';
    sending = false;
    nearBottom = true;
  }

  beforeNavigate(({ to }) => {
    if (to?.route.id !== '/chatbot') resetConversation();
  });

  function trackPosition() {
    nearBottom =
      conversation.scrollHeight -
        conversation.scrollTop -
        conversation.clientHeight <
      80;
  }

  function scrollToLatest() {
    if (nearBottom && conversation)
      conversation.scrollTop = conversation.scrollHeight;
  }

  function resizeComposer() {
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
  }

  onMount(() => {
    active = true;
    ready = true;
    const returning = returnToConversation();
    if (returning) {
      messages = returning.messages.map((message, index) =>
        message.role === 'user'
          ? {
              role: 'user' as const,
              text: message.text,
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }
          : {
              role: 'assistant' as const,
              text: message.text,
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              matchedRuleId: selectReply(returning.messages[index - 1].text)
                .ruleId,
            },
      );
      draft = returning.draft;
      startExchange = returning.range.start;
      endExchange = returning.range.end;
      selecting = true;
      void tick().then(resizeComposer);
    }
    // Touch devices retain the keyboard's natural multiline Enter behavior.
    mobileInput =
      navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    const viewport = window.visualViewport;
    const fitViewport = () => {
      const headerHeight =
        document.querySelector('header')?.getBoundingClientRect().height ?? 80;
      viewportHeight = Math.max(
        0,
        (viewport?.height ?? window.innerHeight) -
          headerHeight -
          (document.querySelector('.bottom-tabs')?.getBoundingClientRect()
            .height ?? 76),
      );
      void tick().then(scrollToLatest);
    };
    fitViewport();
    if (returning) void revealExchange(startExchange);
    window.addEventListener('resize', fitViewport);
    viewport?.addEventListener('resize', fitViewport);
    return () => {
      resetConversation();
      window.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('resize', fitViewport);
    };
  });

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!ready || !active || sending || !text || openingCase) return;
    if (
      messages.length >= 100 ||
      messages.reduce((n, m) => n + m.text.length, 0) +
        text.length +
        selectReply(text).text.length >
        100000
    ) {
      caseError =
        'Conversation limit reached. Submit this conversation as an issue, or leave and return to start fresh.';
      return;
    }
    sending = true;
    messages = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: new Date().toISOString(),
      },
    ];
    draft = '';
    await tick();
    resizeComposer();
    scrollToLatest();
    if (!active) return;
    const reply = selectReply(text);
    messages = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reply.text,
        timestamp: new Date().toISOString(),
        matchedRuleId: reply.ruleId,
      },
    ];
    sending = false;
    await tick();
    scrollToLatest();
  }

  function keydown(event: KeyboardEvent) {
    if (
      event.key === 'Enter' &&
      !mobileInput &&
      !event.shiftKey &&
      !event.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault();
      if (!event.repeat) composer?.form?.requestSubmit();
    }
  }
</script>

<svelte:head><title>Chatbot · AI Constitutions</title></svelte:head>
<svelte:window
  onpagehide={resetConversation}
  onpageshow={() => (active = true)}
/>

<section
  class="chatbot-page"
  class:selecting
  class:compact={viewportHeight !== undefined && viewportHeight < 340}
  style:height={viewportHeight === undefined
    ? undefined
    : `${viewportHeight}px`}
  aria-labelledby="chatbot-title"
>
  <div class="chatbot-heading">
    <div class="chatbot-title-row">
      <h1 id="chatbot-title">Chatbot</h1>
      <button
        class="button secondary hints-button"
        disabled={!ready}
        onclick={() => hintsDialog.showModal()}>Hints</button
      >
      <button
        class="button submit-conversation"
        disabled={!ready || !messages.length || sending || openingCase}
        onclick={selecting ? createCase : beginSelection}
        >{openingCase
          ? 'Opening…'
          : selecting
            ? 'Continue to issue'
            : 'Submit an issue'}</button
      >
    </div>
    {#if page.url.searchParams.get('evidence') === 'missing'}<p
        class="notice"
        role="status"
      >
        The submission snapshot is no longer available. Start a conversation,
        then choose “Submit an issue” to attach it.
      </p>{/if}
    <p id="chatbot-introduction">
      A simulated chatbot with predefined replies. Some replies are
      intentionally flawed. Choose “Submit an issue” to attach a continuous
      section. Your temporary chat can be restored from the unsaved issue form.
    </p>
  </div>

  {#if selecting}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The selection controls must remain keyboard-scrollable in compact viewports.) -->
    <section
      class="conversation-selection"
      aria-labelledby="selection-heading"
      tabindex="0"
    >
      <div class="selection-title">
        <h2 id="selection-heading">Choose what to include</h2>
        <button
          type="button"
          class="comment-action"
          onclick={() => (selecting = false)}>Keep chatting</button
        >
      </div>
      <p>
        Choose the first and last exchange. Every exchange between them is
        included.
      </p>
      <div class="selection-controls">
        <div>
          <label for="selection-start">First exchange</label><select
            id="selection-start"
            value={startExchange}
            onchange={setStart}
            disabled={openingCase || sending}
            >{#each exchanges as exchange, i}<option value={i}
                >{i + 1}. {exchange.text.slice(0, 55)}{exchange.text.length > 55
                  ? '…'
                  : ''}</option
              >{/each}</select
          >
        </div>
        <div>
          <label for="selection-end">Last exchange</label><select
            id="selection-end"
            value={endExchange}
            onchange={setEnd}
            disabled={openingCase || sending}
            >{#each exchanges as exchange, i}<option value={i}
                >{i + 1}. {exchange.text.slice(0, 55)}{exchange.text.length > 55
                  ? '…'
                  : ''}</option
              >{/each}</select
          >
        </div>
      </div>
      <div class="selection-summary">
        <span role="status"
          >{selectedCount} messages selected · Exchanges {startExchange +
            1}–{endExchange + 1}</span
        ><button
          type="button"
          class="thread-toggle"
          disabled={openingCase || sending}
          onclick={() => {
            startExchange = 0;
            endExchange = exchanges.length - 1;
          }}>Select all</button
        >
      </div>
    </section>{/if}

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable conversation needs keyboard focus for scrolling.) -->
  <div
    class="chat-conversation"
    bind:this={conversation}
    onscroll={trackPosition}
    role="log"
    aria-label="Conversation"
    aria-live="polite"
    aria-relevant="additions"
    aria-atomic="false"
    aria-busy={sending}
    tabindex="0"
  >
    {#if messages.length === 0}
      <div class="chat-empty">
        <h2>Start a conversation</h2>
        <p>Type a message below.</p>
      </div>
    {/if}
    <div class="chat-messages">
      {#each messages as message, index (message.id)}
        <article
          class="chat-message"
          data-exchange={Math.floor(index / 2)}
          class:user-message={message.role === 'user'}
          class:included-message={selecting &&
            Math.floor(index / 2) >= startExchange &&
            Math.floor(index / 2) <= endExchange}
          aria-label={message.role === 'user'
            ? 'Your message'
            : 'Chatbot reply'}
        >
          {#if selecting && Math.floor(index / 2) >= startExchange && Math.floor(index / 2) <= endExchange}<span
              class="selection-message-label"
              >Included · Exchange {Math.floor(index / 2) + 1}</span
            >{/if}
          <h2>{message.role === 'user' ? 'You' : 'Chatbot'}</h2>
          <p>{message.text}</p>
        </article>
      {/each}
    </div>
  </div>

  {#if selecting && caseError}<p
      class="notice error selection-error"
      role="alert"
    >
      {caseError}
    </p>{/if}
  {#if !selecting}<div class="chat-composer-area">
      {#if caseError}<p class="notice error" role="alert">{caseError}</p>{/if}
      <form class="chat-composer" onsubmit={send} aria-label="Send a message">
        <label for="chat-message" class="sr-only">Message</label>
        <textarea
          id="chat-message"
          rows="1"
          maxlength="10000"
          bind:this={composer}
          bind:value={draft}
          oninput={resizeComposer}
          onkeydown={keydown}
          placeholder="Write a message…"
          aria-describedby="chatbot-introduction chat-keyboard-hint"
          autocomplete="off"
          spellcheck="true"
          disabled={!ready}></textarea>
        <button
          type="submit"
          class="button"
          disabled={!ready || sending || !draft.trim()}
          >{sending ? 'Replying…' : 'Send'}</button
        >
      </form>
      <p id="chat-keyboard-hint" class="chat-composer-hint">
        {mobileInput
          ? 'Use Send to send your message.'
          : 'Enter to send · Shift + Enter for a new line'}
      </p>
      <noscript
        ><p class="error">
          Enable JavaScript to use the simulated chatbot.
        </p></noscript
      >
    </div>{/if}
</section>

<dialog
  bind:this={hintsDialog}
  class="hints-dialog"
  aria-labelledby="hints-title"
  aria-describedby="hints-introduction"
>
  <div class="hints-heading">
    <h2 id="hints-title">Explore the chatbot</h2>
    <button
      type="button"
      class="button secondary"
      onclick={() => hintsDialog.close()}>Close</button
    >
  </div>
  <p id="hints-introduction">
    One hint for each of the 50 predefined behaviors. Try these topics in your
    own words; some replies are intentionally flawed.
  </p>
  <ol class="chat-hints">
    {#each chatbotHints as hint (hint.id)}<li>
        <h3>{hint.category}</h3>
        <p>{hint.hint}</p>
      </li>{/each}
  </ol>
</dialog>
