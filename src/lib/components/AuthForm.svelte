<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { page } from '$app/state';
  let { data, form } = $props();
  let busy = $state(false),
    now = $state(Date.now()),
    ready = $state(false);
  const step = $derived(form?.step ?? (data.challenge ? 'verify' : 'email'));
  const email = $derived(form?.email ?? data.challenge?.email ?? '');
  const resendAt = $derived(form?.resendAt ?? data.challenge?.resendAt ?? 0);
  const remaining = $derived(Math.max(0, Math.ceil((resendAt - now) / 1000)));
  onMount(() => {
    ready = true;
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const submit: SubmitFunction = () => {
    busy = true;
    return async ({ update }) => {
      try {
        await update();
      } finally {
        busy = false;
        now = Date.now();
      }
    };
  };
</script>

<svelte:head><title>Sign in · AI Constitutions</title></svelte:head>
<div class="auth-shell">
  <h1>{step === 'verify' ? 'Check your email' : 'Sign in or join'}</h1>
  <p class="muted">
    {step === 'verify'
      ? `Enter the six-digit code sent to ${email}.`
      : 'Use your email to sign in. New here? We’ll create your account when you verify your code.'}
  </p>
  {#if page.url.searchParams.has('authError')}<p
      class="notice error"
      role="alert"
    >
      That sign-in link is no longer valid. Request an email code below.
    </p>{/if}
  {#if form?.message}<p
      class="notice"
      class:error={!form.message.startsWith('Code sent')}
      role={form.message.startsWith('Code sent') ? 'status' : 'alert'}
    >
      {form.message}
    </p>{/if}
  {#if step === 'verify'}
    <form
      method="POST"
      action={'?/verify&next=' + encodeURIComponent(data.next)}
      use:enhance={submit}
      data-ready={ready}
    >
      <input type="hidden" name="next" value={data.next} />
      <input type="hidden" name="email" value={email} />
      <label for="token">Verification code</label>
      <input
        id="token"
        name="token"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern={'[0-9]{6}'}
        minlength="6"
        maxlength="6"
        required
        placeholder="000000"
        aria-describedby="code-help"
      />
      <p class="helper" id="code-help">
        Paste or type all six digits, including any leading zero.
      </p>
      <button class="button full" disabled={busy}
        >{busy ? 'Please wait…' : 'Verify and continue'}</button
      >
    </form>
    <form
      method="POST"
      action={'?/send&next=' + encodeURIComponent(data.next)}
      use:enhance={submit}
      class="auth-followup"
    >
      <input type="hidden" name="next" value={data.next} /><input
        type="hidden"
        name="email"
        value={email}
      />
      <button class="button secondary full" disabled={busy || remaining > 0}
        >{remaining > 0
          ? `Resend code in ${remaining}s`
          : 'Resend code'}</button
      >
    </form>
    <form
      method="POST"
      action={'?/change&next=' + encodeURIComponent(data.next)}
      use:enhance={submit}
      class="auth-followup"
    >
      <button class="text-button" disabled={busy}>Use a different email</button>
    </form>
  {:else}
    <form
      method="POST"
      action={'?/send&next=' + encodeURIComponent(data.next)}
      use:enhance={submit}
      data-ready={ready}
    >
      <input type="hidden" name="next" value={data.next} />
      <label for="email">Email address</label>
      <input
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        value={email}
        maxlength="254"
        required
      />
      <button class="button full" disabled={busy}
        >{busy ? 'Sending…' : 'Send verification code'}</button
      >
    </form>
  {/if}
  <p class="helper">
    Your contributions are public and labeled Anonymous. Your email stays
    private.
  </p>
</div>
