<script lang="ts">
  import LineIcon from '#lib/components/LineIcon.svelte';
  import ConversationArt from '#lib/components/ConversationArt.svelte';
  let { data } = $props();

  function animatePrinciple(node: HTMLDetailsElement) {
    const summary = node.querySelector('summary')!;
    let expanded = node.open;
    let animation: Animation | null = null;
    function toggle(event: MouseEvent) {
      event.preventDefault();
      expanded = !expanded;
      const from = node.getBoundingClientRect().height;
      animation?.cancel();
      animation = null;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        node.open = expanded;
        return;
      }
      node.open = true;
      const border = node.offsetHeight - node.clientHeight;
      const to = expanded
        ? node.getBoundingClientRect().height
        : summary.getBoundingClientRect().height + border;
      animation = node.animate(
        [{ height: from + 'px' }, { height: to + 'px' }],
        { duration: 180, easing: 'ease-out' },
      );
      animation.onfinish = () => {
        node.open = expanded;
        animation = null;
      };
    }
    summary.addEventListener('click', toggle);
    return {
      destroy() {
        animation?.cancel();
        summary.removeEventListener('click', toggle);
      },
    };
  }
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
      {#if !data.signedIn}
        <a class="button" href="/signup">Sign up</a>
      {:else}
        <a class="button" href="/chatbot">Open Chatbot</a>
        <button
          type="button"
          class="button secondary"
          onclick={() => window.dispatchEvent(new Event('tutorial:replay'))}
          >Replay tutorial</button
        >
      {/if}
      <!-- <a class="text-link" href="/issues">Browse issues</a> -->
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
        <p>Explore the simulated chatbot.</p>
      </div>
    </li>
    <li>
      <span class="workflow-icon"><LineIcon name="select" size={30} /></span>
      <div>
        <h3>Pick a moment</h3>
        <p>Good or bad, select a portion of the chat worth sharing.</p>
      </div>
    </li>
    <li>
      <span class="workflow-icon"><LineIcon name="edit" size={30} /></span>
      <div>
        <h3>Suggest a change</h3>
        <p>Explain what matters and how the charter could improve.</p>
      </div>
    </li>
  </ol>
  <p class="workflow-note">
    <a href="/signin">Join with a six-digit code</a> sent to your email.
  </p>
</section>

<section class="principles" aria-labelledby="principles-heading">
  <div class="section-heading">
    <h2 id="principles-heading">The Apertus AI Charter</h2>
  </div>
  <div class="constitution-grid charter-principles">
    {#each data.constitutions as principle (principle.number)}
      <details class="constitution-card charter-principle" use:animatePrinciple>
        <summary>
          <span class="charter-preview">
            <strong>{principle.number}. {principle.title}</strong>
            <span>{principle.preview}</span>
          </span>
          <span class="charter-toggle" aria-hidden="true"></span>
        </summary>
        <p class="charter-full-text">{principle.text}</p>
      </details>
    {/each}
  </div>
</section>

