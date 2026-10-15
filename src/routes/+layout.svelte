<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { navigating } from '$app/state';
  let { data, children } = $props();
  let menu = $state(false),
    account = $state(false),
    dark = $state(false),
    ready = $state(false);
  let menuButton: HTMLButtonElement;
  onMount(() => {
    ready = true;
    dark = document.documentElement.dataset.theme === 'dark';
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      if (!localStorage.getItem('theme')) {
        dark = mq.matches;
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      }
    };
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
  function theme() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }
  function close() {
    menu = false;
    account = false;
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && menu) {
      close();
      menuButton?.focus();
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<a class="skip" href="#main">Skip to content</a>
<header>
  <div class="header-inner">
    <a class="brand" href="/" onclick={close}>AI Constitutions</a>
    <div class="header-actions">
      <button
        class="theme-button"
        disabled={!ready}
        onclick={theme}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          {#if dark}
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            />
          {:else}
            <path d="M20.9 13.3A9 9 0 0 1 10.7 3.1a9 9 0 1 0 10.2 10.2Z" />
          {/if}
        </svg>
      </button><button
        bind:this={menuButton}
        disabled={!ready}
        class="icon-button"
        aria-expanded={menu}
        aria-controls="navigation"
        aria-label={menu ? 'Close navigation' : 'Open navigation'}
        onclick={() => (menu = !menu)}
        ><span aria-hidden="true">{menu ? '✕' : '☰'}</span></button
      >
    </div>
    {#if menu}<nav id="navigation" aria-label="Main navigation">
        <a href="/" onclick={close}>Constitutions</a><a
          href="/submit"
          onclick={close}>Submit a Case</a
        ><a href="/cases" onclick={close}>All Cases</a>
        <div class="nav-divider"></div>
        {#if data.signedIn}<button
            class="account-button"
            aria-expanded={account}
            aria-controls="account-menu"
            onclick={() => (account = !account)}>Your account</button
          >{#if account}<div id="account-menu">
              <a href="/my-cases" onclick={close}>My Cases</a>
              <form action="/signout" method="POST">
                <button onclick={close}>Sign Out</button>
              </form>
            </div>{/if}{:else}<a href="/signin" onclick={close}>Sign In</a><a
            href="/signup"
            onclick={close}>Create account</a
          >{/if}
      </nav>{/if}
  </div>
</header>
{#if navigating.to}<div
    class="loading-bar"
    role="status"
    aria-label="Loading page"
  ></div>{/if}
<main id="main" tabindex="-1">{@render children()}</main>
<footer>
  <a class="footer-brand" href="/">AI Constitutions</a>
  <span>Sample principles, open for discussion.</span>
</footer>
