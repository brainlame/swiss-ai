<script lang="ts">
  import type { Transcript } from '#lib/chat-evidence.js';
  let { transcript }: { transcript: Transcript } = $props();
</script>

<section class="chat-evidence" aria-label="Attached conversation">
  <div class="evidence-heading">
    <h2>Attached conversation</h2>
    <span>Read-only evidence</span>
  </div>
  <p class="helper">
    {transcript.length} messages from the simulated chatbot conversation, captured
    when this case was started.
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
