<script lang="ts">
  import CaseForm from '#lib/components/CaseForm.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Submit a Case · AI Constitutions</title></svelte:head>
<div class="page-heading form-page-heading narrow">
  <h1>Submit a case</h1>
  <p>
    Describe a chatbot interaction, include evidence, and propose a change to
    one constitution.
  </p>
</div>
<div class="narrow"><CaseForm constitutions={data.constitutions} /></div>
