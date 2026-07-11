<script lang="ts">
  import { page } from "$app/state";
  let { children } = $props();
  const nav = [
    { href: "/dashboard", label: "صوري" },
    { href: "/dashboard/upload", label: "رفع صورة" },
    { href: "/dashboard/albums", label: "ألبوماتي" },
    { href: "/dashboard/keys", label: "مفاتيح API" },
    { href: "/dashboard/profile", label: "الملف الشخصي" },
  ];
</script>

<div class="mx-auto flex max-w-6xl gap-6 p-4">
  <nav class="w-44 shrink-0 space-y-1 text-sm">
    {#each nav as item (item.href)}
      <a
        href={item.href}
        class="block rounded px-3 py-2 hover:bg-neutral-100"
        class:bg-neutral-100={page.url.pathname === item.href}
        class:font-semibold={page.url.pathname === item.href}
      >
        {item.label}
      </a>
    {/each}
  </nav>
  <div class="flex-1">{@render children()}</div>
</div>
