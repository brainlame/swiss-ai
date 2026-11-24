<script lang="ts">
  let { src = null, size = 32 }: { src?: string | null; size?: number } =
    $props();
  let broken = $state(false);
  $effect(() => {
    void src;
    broken = false;
  });
</script>

<span
  class="profile-avatar"
  style:width={size + 'px'}
  style:height={size + 'px'}
  aria-hidden="true"
>
  {#if src && !broken}<img
      {src}
      alt=""
      onerror={() => (broken = true)}
    />{:else}<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      ><circle cx="12" cy="8" r="3.5" /><path
        d="M5 21v-2a7 7 0 0 1 14 0v2"
      /></svg
    >{/if}
</span>
