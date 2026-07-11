<script lang="ts">
  import PhotoCard from "$lib/PhotoCard.svelte";
  let { data } = $props();
  const name = data.category?.nameAr ?? data.slug;
</script>

<svelte:head><title>{name} — لقطة</title></svelte:head>

<main class="mx-auto max-w-6xl p-4">
  <h1 class="py-6 text-2xl font-bold">{name}</h1>
  {#if data.photos.length === 0}
    <p class="py-16 text-center text-neutral-400">لا توجد صور في هذا التصنيف.</p>
  {:else}
    <div class="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
      {#each data.photos as photo (photo.slug)}
        <PhotoCard {photo} />
      {/each}
    </div>
  {/if}
</main>
