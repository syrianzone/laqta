<script lang="ts">
  import { enhance } from "$app/forms";
  import BlurImage from "$lib/BlurImage.svelte";
  let { data } = $props();

  const statusLabel: Record<string, string> = {
    pending: "قيد المراجعة",
    published: "منشورة",
    flagged: "مُعلَّمة",
    rejected: "مرفوضة",
  };
</script>

<svelte:head><title>صوري — لقطة</title></svelte:head>

<div class="mb-4 flex items-center justify-between">
  <h1 class="text-xl font-bold">صوري</h1>
  <a href="/dashboard/upload" class="rounded bg-neutral-900 px-4 py-2 text-sm text-white">رفع صورة</a>
</div>

{#if data.photos.length === 0}
  <p class="py-16 text-center text-neutral-400">لم ترفع أي صور بعد.</p>
{:else}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
    {#each data.photos as photo (photo.id)}
      <div class="overflow-hidden rounded-lg border">
        <img src={photo.thumb} alt={photo.titleAr ?? ""} class="aspect-square w-full object-cover" loading="lazy" />
        <div class="p-2 text-sm">
          <div class="truncate">{photo.titleAr ?? photo.titleEn ?? "بدون عنوان"}</div>
          <div class="mt-1 flex items-center justify-between">
            <span class="rounded bg-neutral-100 px-2 py-0.5 text-xs">{statusLabel[photo.status] ?? photo.status}</span>
            <span class="text-xs text-neutral-400">👁 {photo.viewsCount} · ❤ {photo.likesCount}</span>
          </div>
          <div class="mt-2 flex gap-3 text-xs">
            {#if photo.status === "published"}
              <a href="/photos/{photo.slug}" class="text-blue-600 hover:underline">عرض</a>
            {/if}
            <form method="POST" action="?/delete" use:enhance>
              <input type="hidden" name="id" value={photo.id} />
              <button class="text-red-600 hover:underline">حذف</button>
            </form>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
