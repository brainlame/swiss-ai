<script lang="ts">
  let { form } = $props();
</script>

<h1>Sign out</h1>
{#if form?.message}<p role="alert">{form.message}</p>{/if}
<form method="POST"><button class="button">Sign Out</button></form>
