<script lang="ts">
  import type { Transcript } from '#lib/chat-evidence.js';
  let {
    transcript,
    onback,
    backDisabled = false,
  }: {
    transcript: Transcript;
    onback?: () => void | Promise<void>;
    backDisabled?: boolean;
  } = $props();
</script>

<section class="chat-evidence" aria-label="Attached conversation">
  <div class="evidence-heading">
    <h2>Attached conversation</h2>
    <div class="evidence-heading-actions">
      <span>Read-only evidence</span>{#if onback}<button
          type="button"
          class="button secondary"
          disabled={backDisabled}
          onclick={onback}>Back to chat</button
        >{/if}
    </div>
  </div>
  <p class="helper">
    {transcript.length} messages attached from the simulated chatbot. This evidence
    stays read-only.
  </p>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Long, read-only transcripts need a keyboard-focusable scroll area.) -->
  <div
    class="evidence-bubbles"
    tabindex="0"
    role="group"
    aria-label="Conversation messages"
  >
    {#each transcript as message, i (i)}
      <article
        class="evidence-bubble"
        class:evidence-prompt={message.role === 'user'}
        aria-label={message.role === 'user'
          ? 'Attached user message'
          : 'Attached chatbot response'}
      >
        <h3>{message.role === 'user' ? 'You' : 'Chatbot'}</h3>
        <p>{message.text}</p>
      </article>
    {/each}
  </div>
</section>
