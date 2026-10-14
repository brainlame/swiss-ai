<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  let { data, form } = $props();
  let busy = $state(false),
    ready = $state(false);
  onMount(() => {
    ready = true;
  });
  const title = $derived(
    data.mode === 'signin'
      ? 'Sign in'
      : data.mode === 'signup'
        ? 'Create your account'
        : data.mode === 'forgot-password'
          ? 'Reset your password'
          : 'Choose a new password',
  );
</script>

<svelte:head><title>{title} · AI Constitutions</title></svelte:head>
<div class="auth-shell">
  <h1>{title}</h1>
  <p class="muted">
    An account helps you manage your cases. Your public contributions are always
    labeled Anonymous.
  </p>
  {#if page.url.searchParams.has('authError')}<p
      class="notice error"
      role="alert"
    >
      This link has expired or is invalid. Sign in or request a fresh password
      reset link.
    </p>{/if}
  {#if form?.message}<p
      class:success={form.success}
      class="notice"
      role={form.success ? 'status' : 'alert'}
    >
      {form.message}
    </p>{/if}
  <form
    method="POST"
    data-ready={ready}
    use:enhance={() => {
      busy = true;
      return async ({ update }) => {
        await update();
        busy = false;
      };
    }}
  >
    <input type="hidden" name="next" value={data.next} />
    {#if data.mode !== 'reset-password'}<label for="email">Email address</label
      ><input
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        value={form?.email ?? ''}
        required
      />{/if}
    {#if data.mode !== 'forgot-password'}<label for="password">Password</label
      ><input
        id="password"
        name="password"
        type="password"
        autocomplete={data.mode === 'signin'
          ? 'current-password'
          : 'new-password'}
        minlength="8"
        required
      />
      <p class="helper">At least 8 characters.</p>{/if}
    <button class="button full" disabled={busy}
      >{busy
        ? 'Please wait…'
        : data.mode === 'signin'
          ? 'Sign In'
          : data.mode === 'signup'
            ? 'Create account'
            : data.mode === 'forgot-password'
              ? 'Send reset link'
              : 'Save new password'}</button
    >
  </form>
  {#if data.mode === 'signin'}<p>
      <a href="/forgot-password">Forgot your password?</a>
    </p>
    <p class="muted">
      New here? <a href={'/signup?next=' + encodeURIComponent(data.next)}
        >Create an account</a
      >
    </p>{:else}<p>
      <a href={'/signin?next=' + encodeURIComponent(data.next)}
        >Back to sign in</a
      >
    </p>{/if}
</div>
