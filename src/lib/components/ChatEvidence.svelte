<script lang="ts">
  import type { ChatExchange } from '#lib/chat-evidence.js';
  let { exchange }: { exchange: ChatExchange } = $props();
</script>

<section class="chat-evidence" aria-label="Attached chat exchange">
  <div class="evidence-heading">
    <h2>Attached chat exchange</h2>
    <span>Read-only evidence</span>
  </div>
  <p class="helper">An exchange with the simulated chatbot.</p>
  <div class="evidence-bubbles">
    <article
      class="evidence-bubble evidence-prompt"
      aria-label="Attached user prompt"
    >
      <h3>User</h3>
      <p>{exchange.prompt}</p>
    </article>
    <article class="evidence-bubble" aria-label="Attached chatbot response">
      <h3>Chatbot</h3>
      <p>{exchange.response}</p>
    </article>
  </div>
</section>
