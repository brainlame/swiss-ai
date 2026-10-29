<script lang="ts">
  import CaseForm from '#lib/components/CaseForm.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Edit your issue · AI Constitutions</title></svelte:head>
<div class="page-heading narrow">
  <a class="back-link" href="/my-issues"> My Issues</a>
  <h1>Edit your issue</h1>
  <p>Saved changes will appear on your public issue.</p>
</div>
<div class="narrow">
  {#key data.item.id + data.item.version}<CaseForm
      constitutions={data.constitutions}
      item={data.item}
    />{/key}
</div>
