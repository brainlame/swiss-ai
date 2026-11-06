<script lang="ts">
  import LineIcon from '#lib/components/LineIcon.svelte';
  import ConversationArt from '#lib/components/ConversationArt.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>Home · AI Constitution</title>
  <meta
    name="description"
    content="Explore chatbot behavior and help shape better AI principles."
  />
</svelte:head>

<section class="hero">
  <div class="hero-content">
    <h1>Better AI starts<br />with a conversation.</h1>
    <p class="hero-copy">
      Try the chatbot. Share what stands out. Help shape the principles behind
      AI.
    </p>
    <div class="hero-actions">
      <a class="button" href="/chatbot">Open Chatbot</a>
      <a class="text-link" href="/issues">Browse issues</a>
    </div>
  </div>
  <div class="hero-art"><ConversationArt /></div>
</section>

<section class="workflow" aria-labelledby="workflow-heading">
  <div class="section-heading">
    <h2 id="workflow-heading">How it works</h2>
  </div>
  <ol class="workflow-steps">
    <li>
      <span class="workflow-icon"><LineIcon name="chat" size={30} /></span>
      <div>
        <h3>Try a conversation</h3>
        <p>Explore the simulated chatbot. Hints give you a place to start.</p>
      </div>
    </li>
    <li>
      <span class="workflow-icon"><LineIcon name="select" size={30} /></span>
      <div>
        <h3>Pick a moment</h3>
        <p>Good or bad, select a continuous part of the chat worth sharing.</p>
      </div>
    </li>
    <li>
      <span class="workflow-icon"><LineIcon name="edit" size={30} /></span>
      <div>
        <h3>Suggest a change</h3>
        <p>Explain what matters and how one principle could improve.</p>
      </div>
    </li>
  </ol>
  <p class="workflow-note">
    <a href="/signin">Join with a six-digit code</a> sent to your email. Public contributions
    are Anonymous.
  </p>
</section>

<section class="principles" aria-labelledby="principles-heading">
  <div class="section-heading">
    <h2 id="principles-heading">The 11 principles</h2>
    <span class="pill sample">Sample content</span>
  </div>
  <p class="section-intro">
    Sample statements pending replacement, not adopted policy.
  </p>
  <div class="constitution-grid">
    {#each data.constitutions as c}
      <article class="constitution-card">
        <h3>Principle #{c.number}</h3>
        <p>{c.text}</p>
      </article>
    {/each}
  </div>
</section>

<p class="project-note">Formal review and model training come later.</p>
