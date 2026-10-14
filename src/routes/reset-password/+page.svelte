<script lang="ts">
  import AuthForm from '#lib/components/AuthForm.svelte';
  let { data, form } = $props();
</script>

<AuthForm {data} {form} />
