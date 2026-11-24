<script lang="ts">
  import { page } from '$app/state';
  import AuthForm from '#lib/components/AuthForm.svelte';
  let { data, form } = $props();
</script>

{#if page.url.searchParams.has('accountDeleted')}<p
    class="notice success"
    role="status"
  >
    Your account has been deleted.
  </p>{/if}
<AuthForm {data} {form} />
