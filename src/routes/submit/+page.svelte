<script lang="ts">
  import CaseForm from '#lib/components/CaseForm.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Submit an issue · AI Constitutions</title></svelte:head>
<div class="page-heading form-page-heading narrow">
  <h1>Submit an issue</h1>
  <p>Share what happened and what could improve.</p>
</div>
<div class="narrow"><CaseForm constitutions={data.constitutions} /></div>
