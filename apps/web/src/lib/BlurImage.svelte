<script lang="ts">
  import { decode } from "blurhash";

  interface Props {
    src: string;
    blurhash?: string | null;
    dominantColor?: string | null;
    alt: string;
    width?: number | null;
    height?: number | null;
    class?: string;
    sizes?: string;
  }

  let {
    src,
    blurhash = null,
    dominantColor = null,
    alt,
    width = null,
    height = null,
    class: klass = "",
    sizes,
  }: Props = $props();

  let loaded = $state(false);

  /** Decode the BlurHash into a canvas as an instant LQIP placeholder. */
  function blurCanvas(node: HTMLCanvasElement) {
    if (!blurhash) return;
    try {
      const w = 32;
      const h = 32;
      const pixels = decode(blurhash, w, h);
      const ctx = node.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.createImageData(w, h);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // invalid hash — dominant color background remains
    }
  }

  const ratio = width && height ? `${width} / ${height}` : "1 / 1";
</script>

<div
  class="blurimg {klass}"
  style="aspect-ratio: {ratio}; background: {dominantColor ?? '#e5e5e5'}"
>
  {#if blurhash}
    <canvas
      use:blurCanvas
      width="32"
      height="32"
      class="ph"
      class:hidden={loaded}
      aria-hidden="true"
    ></canvas>
  {/if}
  <img
    {src}
    {alt}
    {sizes}
    loading="lazy"
    decoding="async"
    class="real"
    class:show={loaded}
    onload={() => (loaded = true)}
  />
</div>

<style>
  .blurimg {
    position: relative;
    overflow: hidden;
    width: 100%;
  }
  .ph,
  .real {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ph {
    image-rendering: auto;
    filter: blur(4px);
    transform: scale(1.05);
  }
  .ph.hidden {
    opacity: 0;
  }
  .real {
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .real.show {
    opacity: 1;
  }
</style>
