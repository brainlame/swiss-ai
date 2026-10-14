<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Constitutions · AI Constitutions</title>
  <meta
    name="description"
    content="Read the sample AI constitutions and contribute chatbot examples with proposed improvements."
  />
</svelte:head>

<section class="hero">
  <h1>Constitutions</h1>
  <p class="hero-copy">
    These principles describe how an AI chatbot should behave. Share a real
    interaction and suggest how one of them could be improved.
  </p>
  <div class="hero-actions">
    <a class="button" href="/submit">Submit a Case</a>
    <a class="text-link" href="/cases">Browse cases</a>
  </div>
</section>

<section class="principles" aria-labelledby="principles-heading">
  <div class="section-heading">
    <h2 id="principles-heading">The 11 constitutions</h2>
    <span class="pill sample">Sample content</span>
  </div>
  <p class="section-intro">
    These are sample statements pending replacement, not adopted policy.
  </p>
  <div class="constitution-grid">
    {#each data.constitutions as c}
      <article class="constitution-card">
        <h3>Constitution #{c.number}</h3>
        <p>{c.text}</p>
        <a href={'/submit?constitution=' + c.number}>Propose an improvement</a>
      </article>
    {/each}
  </div>
</section>

<p class="project-note">
  This version collects cases and proposed changes. Community review and model
  training are planned for later.
</p>
