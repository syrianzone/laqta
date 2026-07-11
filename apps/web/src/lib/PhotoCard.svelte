<script lang="ts">
  import BlurImage from "$lib/BlurImage.svelte";
  import type { PhotoCardData } from "$lib/types";

  let { photo }: { photo: PhotoCardData } = $props();
  const title = photo.titleAr ?? photo.titleEn ?? "";
</script>

<a href="/photos/{photo.slug}" class="group block overflow-hidden rounded-lg">
  <BlurImage
    src={photo.medium}
    blurhash={photo.blurhash}
    dominantColor={photo.dominantColor}
    width={photo.width}
    height={photo.height}
    alt={title}
    class="transition-transform duration-300 group-hover:scale-[1.03]"
  />
  {#if title}
    <div class="truncate px-1 py-2 text-sm text-neutral-700">{title}</div>
  {/if}
</a>
