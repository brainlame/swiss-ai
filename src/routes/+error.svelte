<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head><title>Something went wrong · AI Constitutions</title></svelte:head
>
<div class="empty-state">
  <p class="error-code">{page.status}</p>
  <h1>
    {page.status === 404 ? 'Page not found' : 'We couldn’t load this page'}
  </h1>
  <p>{page.error?.message}</p>
  <p>
    <a class="button" href={page.url.pathname + page.url.search}>Try again</a>
    <a href="/">Back to constitutions</a>
  </p>
</div>
