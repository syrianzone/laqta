<script lang="ts">
  import { goto } from "$app/navigation";
  let { data } = $props();

  let file = $state<File | null>(null);
  let titleAr = $state("");
  let captionAr = $state("");
  let descAr = $state("");
  let categorySlug = $state("");
  let license = $state("cc-by");
  let tags = $state("");
  let status = $state<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  let errorMsg = $state("");

  function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!file) return;
    status = "uploading";
    errorMsg = "";
    try {
      // 1. presign
      const presignRes = await fetch(`${data.apiUrl}/uploads/presign`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!presignRes.ok) throw new Error("تعذّر بدء الرفع");
      const { photoId, uploadUrl } = await presignRes.json();

      // 2. PUT the original directly to R2
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("فشل رفع الملف");

      // 3. complete with metadata → triggers processing + moderation
      status = "processing";
      const completeRes = await fetch(`${data.apiUrl}/uploads/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          photoId,
          titleAr,
          captionAr,
          descAr,
          categorySlug: categorySlug || undefined,
          license,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!completeRes.ok) throw new Error("تعذّر حفظ البيانات");
      status = "done";
      setTimeout(() => goto("/dashboard"), 1200);
    } catch (err) {
      status = "error";
      errorMsg = err instanceof Error ? err.message : "خطأ غير متوقع";
    }
  }
</script>

<svelte:head><title>رفع صورة — لقطة</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">رفع صورة جديدة</h1>

{#if status === "done"}
  <div class="rounded border border-green-300 bg-green-50 p-4 text-sm">
    تم الرفع! صورتك الآن قيد المعالجة والمراجعة.
  </div>
{:else}
  <form onsubmit={submit} class="max-w-lg space-y-4">
    <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onchange={onFile} required class="block w-full text-sm" />

    <input bind:value={titleAr} placeholder="العنوان" class="w-full rounded border px-3 py-2 text-sm" />
    <input bind:value={captionAr} placeholder="تعليق قصير" class="w-full rounded border px-3 py-2 text-sm" />
    <textarea bind:value={descAr} placeholder="وصف" rows="3" class="w-full rounded border px-3 py-2 text-sm"></textarea>

    <select bind:value={categorySlug} class="w-full rounded border px-3 py-2 text-sm">
      <option value="">— التصنيف —</option>
      {#each data.categories as c (c.slug)}
        <option value={c.slug}>{c.nameAr}</option>
      {/each}
    </select>

    <select bind:value={license} class="w-full rounded border px-3 py-2 text-sm">
      {#each data.licenses as l (l.id)}
        <option value={l.id}>{l.name}</option>
      {/each}
    </select>

    <input bind:value={tags} placeholder="وسوم (مفصولة بفواصل)" class="w-full rounded border px-3 py-2 text-sm" />

    {#if status === "error"}
      <p class="text-sm text-red-600">{errorMsg}</p>
    {/if}

    <button
      class="rounded bg-neutral-900 px-5 py-2 text-sm text-white disabled:opacity-60"
      disabled={!file || status === "uploading" || status === "processing"}
    >
      {status === "uploading" ? "جارٍ الرفع…" : status === "processing" ? "جارٍ المعالجة…" : "رفع"}
    </button>
  </form>
{/if}
