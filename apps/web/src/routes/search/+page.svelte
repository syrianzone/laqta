<script lang="ts">
  import PhotoCard from "$lib/PhotoCard.svelte";
  let { data } = $props();
</script>

<svelte:head><title>بحث{data.q ? `: ${data.q}` : ""} — لقطة</title></svelte:head>

<main class="mx-auto max-w-6xl p-4">
  <form action="/search" class="py-6">
    <input
      name="q"
      value={data.q}
      placeholder="ابحث عن صور… (مثال: قلعة، طبيعة، دمشق)"
      class="w-full rounded-lg border border-neutral-300 px-4 py-3 text-lg"
      autofocus
    />
  </form>

  {#if data.q}
    <p class="mb-4 text-sm text-neutral-500">
      {data.found} نتيجة لـ «{data.q}»
    </p>
  {/if}

  {#if data.q && data.items.length === 0}
    <p class="py-16 text-center text-neutral-400">لا توجد نتائج.</p>
  {:else}
    <div class="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
      {#each data.items as photo (photo.slug)}
        <PhotoCard {photo} />
      {/each}
    </div>
  {/if}
</main>
