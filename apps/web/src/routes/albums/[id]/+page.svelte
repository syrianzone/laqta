<script lang="ts">
  import PhotoCard from "$lib/PhotoCard.svelte";
  let { data } = $props();
  const title = data.album.titleAr ?? data.album.titleEn ?? "ألبوم";
</script>

<svelte:head><title>{title} — لقطة</title></svelte:head>

<main class="mx-auto max-w-6xl p-4">
  <header class="py-6">
    <h1 class="text-2xl font-bold">{title}</h1>
    {#if data.album.owner}
      <p class="mt-1 text-sm text-neutral-500">من إعداد {data.album.owner}</p>
    {/if}
  </header>
  {#if data.items.length === 0}
    <p class="py-16 text-center text-neutral-400">لا توجد صور منشورة في هذا الألبوم.</p>
  {:else}
    <div class="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
      {#each data.items as photo (photo.slug)}
        <PhotoCard {photo} />
      {/each}
    </div>
  {/if}
</main>
