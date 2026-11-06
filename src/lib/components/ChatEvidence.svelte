<script lang="ts">
  import type { Transcript } from '#lib/chat-evidence.js';
  let {
    transcript,
    onback,
    sample = false,
    backDisabled = false,
  }: {
    transcript: Transcript;
    sample?: boolean;
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
    {sample
      ? 'Fictional conversation illustrating this issue.'
      : transcript.length + ' messages from the simulated chatbot.'}
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
        <h3>
          {message.role === 'user' ? (sample ? 'User' : 'You') : 'Chatbot'}
        </h3>
        <p>{message.text}</p>
      </article>
    {/each}
  </div>
</section>
