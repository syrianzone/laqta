<script lang="ts">
  import PhotoCard from "$lib/PhotoCard.svelte";
  let { data } = $props();
</script>

<svelte:head>
  <title>لقطة — منصة الصور السورية المفتوحة</title>
  <meta
    name="description"
    content="أرشيف مفتوح للصور السورية عالية الجودة — عمارة، طبيعة، حياة يومية، ومعالم تاريخية."
  />
</svelte:head>

<main class="mx-auto max-w-6xl p-4">
  <section class="py-8 text-center">
    <h1 class="text-3xl font-bold">لقطة</h1>
    <p class="mt-2 text-neutral-600">
      أرشيف مفتوح للصور السورية — للاستخدام الحر في التصميم والإعلام والبرمجيات
    </p>
  </section>

  {#if data.categories.length}
    <nav class="mb-6 flex flex-wrap justify-center gap-2 text-sm">
      {#each data.categories as cat (cat.slug)}
        <a
          href="/c/{cat.slug}"
          class="rounded-full bg-neutral-100 px-3 py-1.5 hover:bg-neutral-200"
        >
          {cat.nameAr}
        </a>
      {/each}
    </nav>
  {/if}

  {#if data.photos.length === 0}
    <p class="py-16 text-center text-neutral-400">لا توجد صور منشورة بعد.</p>
  {:else}
    <div class="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
      {#each data.photos as photo (photo.slug)}
        <PhotoCard {photo} />
      {/each}
    </div>
  {/if}
</main>
