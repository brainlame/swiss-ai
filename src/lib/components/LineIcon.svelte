<script lang="ts">
  let {
    name,
    size = 24,
  }: { name: 'chat' | 'select' | 'edit' | 'people' | 'search'; size?: number } =
    $props();
  const paths = {
    chat: 'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-5 3v-7a7.5 7.5 0 0 1 7.5-11H13a7 7 0 0 1 7 7.5ZM7 9h9M7 13h6',
    select: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 9h8M8 13h5',
    edit: 'M14 5 19 10M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14v6ZM13 21h8',
    people:
      'M16 21v-2a5 5 0 0 0-5-5H8a5 5 0 0 0-5 5v2M16 4a4 4 0 0 1 0 8M21 21v-2a5 5 0 0 0-3-4.6M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
