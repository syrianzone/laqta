<script lang="ts">
  import { enhance } from "$app/forms";
  let { data } = $props();
</script>

<svelte:head><title>ألبوماتي — لقطة</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">ألبوماتي</h1>

<form method="POST" action="?/create" use:enhance class="mb-8 flex gap-2">
  <input name="titleAr" placeholder="عنوان الألبوم" class="flex-1 rounded border px-3 py-2 text-sm" />
  <button class="rounded bg-neutral-900 px-4 py-2 text-sm text-white">إنشاء ألبوم</button>
</form>

{#if data.albums.length === 0}
  <p class="text-neutral-400">لا توجد ألبومات بعد.</p>
{:else}
  <ul class="space-y-2">
    {#each data.albums as album (album.id)}
      <li class="flex items-center justify-between rounded border p-3 text-sm">
        <a href="/albums/{album.id}" class="hover:underline">
          {album.titleAr ?? album.titleEn ?? "بدون عنوان"}
          <span class="text-neutral-400">({album.count})</span>
        </a>
        <form method="POST" action="?/delete" use:enhance>
          <input type="hidden" name="id" value={album.id} />
          <button class="text-red-600 hover:underline">حذف</button>
        </form>
      </li>
    {/each}
  </ul>
{/if}
