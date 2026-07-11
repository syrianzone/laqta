<script lang="ts">
  import BlurImage from "$lib/BlurImage.svelte";
  import PhotoCard from "$lib/PhotoCard.svelte";

  let { data } = $props();
  const p = data.photo;
  const similar = (data.similar ?? []) as any[];
  const title = p.titleAr ?? p.titleEn ?? "صورة";
  const loggedIn = !!data.user;

  // Engagement state
  let liked = $state<boolean>(!!p.likedByMe);
  let likes = $state<number>(p.likes);
  let commentList = $state<any[]>(p.comments ?? []);
  let commentBody = $state("");
  let posting = $state(false);

  async function toggleLike() {
    if (!loggedIn) return;
    const method = liked ? "DELETE" : "POST";
    const res = await fetch(`${data.apiUrl}/photos/${p.slug}/like`, {
      method,
      credentials: "include",
    });
    if (res.ok) {
      const b = await res.json();
      liked = b.liked;
      likes = b.likes;
    }
  }

  async function postComment(e: Event) {
    e.preventDefault();
    if (!commentBody.trim() || posting) return;
    posting = true;
    const res = await fetch(`${data.apiUrl}/photos/${p.slug}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    if (res.ok) {
      commentList = [await res.json(), ...commentList];
      commentBody = "";
    }
    posting = false;
  }

  let copied = $state("");
  async function copy(kind: string, text: string) {
    await navigator.clipboard.writeText(text);
    copied = kind;
    setTimeout(() => (copied = ""), 1500);
  }

  const apiCall = `curl "${data.apiUrl}/api/v1/photos/${p.slug}"`;

  const exif = (p.exif ?? {}) as Record<string, unknown>;
  const exifRows = [
    ["الكاميرا", [exif.make, exif.model].filter(Boolean).join(" ")],
    ["العدسة", exif.lens],
    ["البعد البؤري", exif.focalLength ? `${exif.focalLength}mm` : null],
    ["الفتحة", exif.fNumber ? `f/${exif.fNumber}` : null],
    ["سرعة الغالق", exif.exposureTime ? `${exif.exposureTime}s` : null],
    ["ISO", exif.iso],
  ].filter(([, v]) => v);

  // schema.org/ImageObject for SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: title,
    description: p.descAr ?? p.captionAr ?? undefined,
    contentUrl: p.images.full,
    thumbnailUrl: p.images.renditions.find((r: any) => r.variant === "thumb")?.url,
    license: p.license.url,
    acquireLicensePage: `${data.webUrl}/photos/${p.slug}`,
    creditText: p.license.credit,
    creator: { "@type": "Person", name: p.owner.name },
    ...(p.lat && p.lng
      ? { contentLocation: { "@type": "Place", geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } } }
      : {}),
  };
</script>

<svelte:head>
  <title>{title} — لقطة</title>
  <meta name="description" content={p.descAr ?? p.captionAr ?? title} />
  <link rel="canonical" href={`${data.webUrl}/photos/${p.slug}`} />
  <link rel="alternate" hreflang="ar-SY" href={`${data.webUrl}/photos/${p.slug}`} />
  <link rel="alternate" hreflang="x-default" href={`${data.webUrl}/photos/${p.slug}`} />
  <meta property="og:title" content={title} />
  <meta property="og:image" content={p.images.full} />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="ar_SY" />
  <meta property="og:url" content={`${data.webUrl}/photos/${p.slug}`} />
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</` + `script>`}
</svelte:head>

<main class="mx-auto max-w-5xl p-4">
  <article class="grid gap-6 lg:grid-cols-[1fr_320px]">
    <!-- Image -->
    <div>
      <BlurImage
        src={p.images.full}
        blurhash={p.blurhash}
        dominantColor={p.dominantColor}
        width={p.width}
        height={p.height}
        alt={p.altAr ?? p.altEn ?? title}
        class="rounded-lg"
      />
      {#if p.captionAr || p.captionEn}
        <p class="mt-3 text-neutral-600">{p.captionAr ?? p.captionEn}</p>
      {/if}
      {#if p.descAr || p.descEn}
        <p class="mt-2 text-sm text-neutral-500">{p.descAr ?? p.descEn}</p>
      {/if}

      {#if exifRows.length}
        <section class="mt-6">
          <h2 class="mb-2 text-sm font-semibold text-neutral-700">بيانات الكاميرا</h2>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {#each exifRows as [label, value]}
              <div><dt class="inline text-neutral-400">{label}:</dt> <dd class="inline">{value}</dd></div>
            {/each}
          </dl>
        </section>
      {/if}

      {#if p.lat && p.lng}
        <section class="mt-6">
          <h2 class="mb-2 text-sm font-semibold text-neutral-700">الموقع</h2>
          <a
            class="text-sm text-blue-600 hover:underline"
            href="https://www.openstreetmap.org/?mlat={p.lat}&mlon={p.lng}#map=14/{p.lat}/{p.lng}"
            target="_blank"
            rel="noopener"
          >
            {p.locationName ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`} — عرض على الخريطة
          </a>
          <a class="ms-3 text-sm text-neutral-500 hover:underline" href="/near?lat={p.lat}&lng={p.lng}">
            صور قريبة
          </a>
        </section>
      {/if}
    </div>

    <!-- Sidebar -->
    <aside class="space-y-5">
      <div>
        <h1 class="text-xl font-bold">{title}</h1>
        <p class="mt-1 text-sm text-neutral-500">
          بعدسة {p.owner.name}
        </p>
        <div class="mt-2 flex items-center gap-4 text-sm text-neutral-500">
          <span>👁 {p.views}</span>
          <span>⬇ {p.downloads}</span>
          <button
            onclick={toggleLike}
            disabled={!loggedIn}
            title={loggedIn ? "" : "سجّل الدخول للإعجاب"}
            class="flex items-center gap-1 {liked ? 'text-red-600' : ''} disabled:opacity-60"
          >
            {liked ? "❤" : "🤍"} {likes}
          </button>
        </div>
      </div>

      <!-- Downloads -->
      <div>
        <h2 class="mb-2 text-sm font-semibold text-neutral-700">تنزيل</h2>
        <div class="flex flex-col gap-2 text-sm">
          {#each p.images.renditions as r (r.variant)}
            <a
              class="flex justify-between rounded bg-neutral-100 px-3 py-2 hover:bg-neutral-200"
              href="{data.apiUrl}/ssr/download/{p.slug}/{r.variant}"
            >
              <span>{r.variant === "large" ? "كبير" : r.variant === "medium" ? "متوسط" : "مصغّر"}</span>
              <span class="text-neutral-400">{r.width}×{r.height}</span>
            </a>
          {/each}
          <a
            class="rounded bg-neutral-900 px-3 py-2 text-center text-white hover:bg-neutral-800"
            href="{data.apiUrl}/ssr/download/{p.slug}/original?turnstile=dev"
          >
            الأصل الكامل الدقة
          </a>
        </div>
      </div>

      <!-- License + attribution -->
      <div>
        <h2 class="mb-2 text-sm font-semibold text-neutral-700">الترخيص</h2>
        <a class="text-sm text-blue-600 hover:underline" href={p.license.url} rel="license" target="_blank">
          {p.license.name_ar}
        </a>
        <div class="mt-3 space-y-2">
          <button class="w-full rounded border px-3 py-1.5 text-xs" onclick={() => copy("text", p.attribution.text)}>
            {copied === "text" ? "✓ تم النسخ" : "نسخ النَّسب (نص)"}
          </button>
          <button class="w-full rounded border px-3 py-1.5 text-xs" onclick={() => copy("html", p.attribution.html)}>
            {copied === "html" ? "✓ تم النسخ" : "نسخ النَّسب (HTML)"}
          </button>
          <button class="w-full rounded border px-3 py-1.5 text-xs" onclick={() => copy("api", apiCall)}>
            {copied === "api" ? "✓ تم النسخ" : "نسخ استدعاء API"}
          </button>
        </div>
      </div>

      {#if p.tags?.length}
        <div>
          <h2 class="mb-2 text-sm font-semibold text-neutral-700">وسوم</h2>
          <div class="flex flex-wrap gap-1.5">
            {#each p.tags as t (t.slug)}
              <a href="/?tag={t.slug}" class="rounded-full bg-neutral-100 px-2.5 py-1 text-xs">{t.nameAr}</a>
            {/each}
          </div>
        </div>
      {/if}
    </aside>
  </article>

  <!-- Comments -->
  <section class="mt-10 max-w-2xl">
    <h2 class="mb-3 text-lg font-semibold">التعليقات ({commentList.length})</h2>
    {#if loggedIn}
      <form onsubmit={postComment} class="mb-5">
        <textarea
          bind:value={commentBody}
          placeholder="أضف تعليقًا…"
          rows="2"
          class="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        ></textarea>
        <button
          class="mt-2 rounded bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-60"
          disabled={posting || !commentBody.trim()}
        >
          نشر
        </button>
      </form>
    {:else}
      <p class="mb-5 text-sm text-neutral-500">سجّل الدخول للتعليق.</p>
    {/if}

    {#if commentList.length === 0}
      <p class="text-sm text-neutral-400">لا توجد تعليقات بعد.</p>
    {:else}
      <ul class="space-y-3">
        {#each commentList as comment (comment.id)}
          <li class="rounded border border-neutral-100 bg-neutral-50 p-3 text-sm">
            <div class="font-medium">{comment.author}</div>
            <p class="mt-1 whitespace-pre-wrap text-neutral-700">{comment.body}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if similar.length}
    <section class="mt-10">
      <h2 class="mb-3 text-lg font-semibold">صور مشابهة</h2>
      <div class="columns-2 gap-3 sm:columns-3 lg:columns-5 [&>*]:mb-3">
        {#each similar as photo (photo.slug)}
          <PhotoCard {photo} />
        {/each}
      </div>
    </section>
  {/if}
</main>
