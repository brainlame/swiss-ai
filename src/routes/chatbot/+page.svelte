<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { selectReply, type ChatMessage } from '#lib/chatbot.js';
  import { chatbotHints } from '#lib/chatbot-hints.js';
  import { attachExchange, clearExchange } from '#lib/chat-evidence.js';

  let messages = $state<ChatMessage[]>([]);
  let draft = $state('');
  let sending = $state(false);
  let ready = $state(false);
  let viewportHeight = $state<number>();
  let conversation: HTMLDivElement;
  let composer: HTMLTextAreaElement;
  let nearBottom = true;
  let mobileInput = $state(false);
  let active = true;
  let hintsDialog: HTMLDialogElement;
  let openingCase = $state(false);
  let caseError = $state('');

  async function createCase(index: number) {
    if (openingCase) return;
    const response = messages[index];
    const prompt = messages[index - 1];
    if (response?.role !== 'assistant' || prompt?.role !== 'user') return;
    openingCase = true;
    caseError = '';
    attachExchange({ prompt: prompt.text, response: response.text });
    try {
      await goto('/submit?source=chatbot');
    } catch {
      caseError = 'The case form could not be opened. Please try again.';
    } finally {
      clearExchange();
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
    // Touch devices retain the keyboard's natural multiline Enter behavior.
    mobileInput =
      navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    const viewport = window.visualViewport;
    const fitViewport = () => {
      const headerHeight =
        document.querySelector('header')?.getBoundingClientRect().height ?? 80;
      viewportHeight = Math.max(
        0,
        (viewport?.height ?? window.innerHeight) - headerHeight,
      );
      void tick().then(scrollToLatest);
    };
    fitViewport();
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
    if (!ready || !active || sending || !text) return;
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
      if (!event.repeat) composer.form?.requestSubmit();
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
    </div>
    <p id="chatbot-introduction">
      A simulated chatbot with predefined replies. Some replies are
      intentionally flawed. Your conversation disappears when you leave this
      page.
    </p>
  </div>

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
          class:user-message={message.role === 'user'}
          aria-label={message.role === 'user'
            ? 'Your message'
            : 'Chatbot reply'}
        >
          <h2>{message.role === 'user' ? 'You' : 'Chatbot'}</h2>
          <p>{message.text}</p>
          {#if message.role === 'assistant'}<button
              type="button"
              class="create-case-link"
              disabled={openingCase}
              onclick={() => createCase(index)}>Create a case</button
            >{/if}
        </article>
      {/each}
    </div>
  </div>

  <div class="chat-composer-area">
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
  </div>
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
