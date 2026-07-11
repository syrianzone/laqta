<script lang="ts">
  import { enhance } from "$app/forms";
  let { data } = $props();

  function scoreSummary(scores: unknown): string {
    if (!scores || typeof scores !== "object") return "";
    const s = scores as Record<string, unknown>;
    const conf = typeof s.confidence === "number" ? Math.round(s.confidence * 100) : null;
    const flags = ["nsfw", "violence", "hate"].filter((k) => s[k] === true);
    const topic = s.on_topic === false ? "خارج الموضوع" : "ضمن الموضوع";
    return `${topic}${flags.length ? " · " + flags.join("، ") : ""}${conf !== null ? ` · ثقة ${conf}%` : ""}`;
  }
</script>

<svelte:head><title>لوحة الإشراف — لقطة</title></svelte:head>

<main class="mx-auto max-w-5xl p-6">
  <h1 class="mb-4 text-2xl font-bold">لوحة الإشراف</h1>

  <div class="mb-6 flex gap-2 text-sm">
    <a href="?status=pending" class="rounded px-3 py-1.5"
       class:bg-neutral-900={data.status === "pending"}
       class:text-white={data.status === "pending"}
       class:bg-neutral-100={data.status !== "pending"}>
      قيد الانتظار
    </a>
    <a href="?status=flagged" class="rounded px-3 py-1.5"
       class:bg-neutral-900={data.status === "flagged"}
       class:text-white={data.status === "flagged"}
       class:bg-neutral-100={data.status !== "flagged"}>
      مُعلَّمة آليًا
    </a>
  </div>

  {#if data.items.length === 0}
    <p class="text-neutral-500">لا توجد صور في هذه القائمة.</p>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.items as item (item.id)}
        <article class="overflow-hidden rounded-lg border border-neutral-200">
          <img
            src={item.thumbUrl}
            alt={item.titleAr ?? item.titleEn ?? ""}
            style={item.blurhash ? `background:#eee` : ""}
            class="aspect-square w-full object-cover"
            loading="lazy"
          />
          <div class="p-3 text-sm">
            <div class="font-medium">{item.titleAr ?? item.titleEn ?? "بدون عنوان"}</div>
            <div class="text-neutral-500">{item.ownerName ?? "—"}</div>
            {#if item.ai}
              <div class="mt-1 text-xs text-amber-700">{scoreSummary(item.ai.scores)}</div>
              {#if item.ai.reason}
                <div class="text-xs text-neutral-400">{item.ai.reason}</div>
              {/if}
            {/if}
            <div class="mt-3 flex gap-2">
              <form method="POST" action="?/approve" use:enhance>
                <input type="hidden" name="id" value={item.id} />
                <button class="rounded bg-green-600 px-3 py-1.5 text-xs text-white">اعتماد</button>
              </form>
              <form method="POST" action="?/reject" use:enhance>
                <input type="hidden" name="id" value={item.id} />
                <button class="rounded bg-red-600 px-3 py-1.5 text-xs text-white">رفض</button>
              </form>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</main>
