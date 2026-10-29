<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { navigating, page } from '$app/state';
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { discardIssueFlow } from '#lib/chat-evidence.js';
  let { data, children } = $props();
  let account = $state(false),
    dark = $state(false),
    ready = $state(false);
  let accountButton = $state<HTMLButtonElement>();
  const tabs = [
    {
      href: '/',
      label: 'Home',
      path: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
    },
    {
      href: '/chatbot',
      label: 'Chatbot',
      path: 'M4 4h16v12H8l-4 4V4Zm4 5h8m-8 3h5',
    },
    {
      href: '/issues',
      label: 'All Issues',
      path: 'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4',
    },
  ];
  afterNavigate(() => (account = false));
  beforeNavigate(({ to }) => {
    if (!to || !['/chatbot', '/submit'].includes(to.url.pathname))
      discardIssueFlow();
  });
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
    account = false;
  }
</script>

<svelte:window
  onpagehide={discardIssueFlow}
  onkeydown={(e) => {
    if (e.key === 'Escape' && account) {
      close();
      accountButton?.focus();
    }
  }}
/>
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
      </button>
      {#if data.signedIn}
        <button
          bind:this={accountButton}
          class="account-button"
          disabled={!ready}
          aria-expanded={account}
          aria-controls="account-menu"
          onclick={() => (account = !account)}>Account</button
        >
      {:else}<a class="account-button" href="/signin">Sign in</a>{/if}
    </div>
    {#if account && data.signedIn}<div
        id="account-menu"
        class="account-popover"
      >
        <a href="/my-issues" onclick={close}>My Issues</a>
        <form action="/signout" method="POST"><button>Sign Out</button></form>
      </div>{/if}
  </div>
</header>
{#if navigating.to}<div
    class="loading-bar"
    role="status"
    aria-label="Loading page"
  ></div>{/if}
<main id="main" tabindex="-1">{@render children()}</main>
<footer>
  <a class="footer-brand" href="/">AI Constitutions</a><span
    >Sample principles, open for discussion.</span
  >
</footer>
<nav class="bottom-tabs" aria-label="Main navigation">
  <div class="bottom-tabs-inner">
    {#each tabs as tab}
      {@const active =
        tab.href === '/'
          ? page.url.pathname === '/'
          : tab.href === '/chatbot'
            ? page.url.pathname === '/chatbot' ||
              page.url.pathname === '/submit'
            : page.url.pathname.startsWith('/issues')}
      <a
        href={tab.href}
        data-sveltekit-preload-data={tab.href === '/issues'
          ? 'false'
          : undefined}
        aria-current={active ? 'page' : undefined}
        onclick={close}
      >
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"><path d={tab.path} /></svg
        >
        <span>{tab.label}</span>
      </a>
    {/each}
  </div>
</nav>
