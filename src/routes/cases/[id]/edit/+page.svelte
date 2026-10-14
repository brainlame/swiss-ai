<script lang="ts">
  import CaseForm from '#lib/components/CaseForm.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Edit your case · AI Constitutions</title></svelte:head>
<div class="page-heading narrow">
  <a class="back-link" href="/my-cases"> My Cases</a>
  <h1>Edit your case</h1>
  <p>Saved changes will appear on your public case.</p>
</div>
<div class="narrow">
  {#key data.item.id + data.item.version}<CaseForm
      constitutions={data.constitutions}
      item={data.item}
    />{/key}
</div>
