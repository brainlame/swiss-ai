<script lang="ts">
  import CaseList from '#lib/components/CaseList.svelte';
  let { data } = $props();
</script>

<CaseList {data} />
