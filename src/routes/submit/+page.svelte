<script lang="ts">
  import CaseForm from '#lib/components/CaseForm.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Submit a Issue · AI Constitutions</title></svelte:head>
<div class="page-heading form-page-heading narrow">
  <h1>Submit an issue</h1>
  <p>
    Review your attached conversation, describe the behavior, and propose a
    change to one constitution.
  </p>
</div>
<div class="narrow"><CaseForm constitutions={data.constitutions} /></div>
