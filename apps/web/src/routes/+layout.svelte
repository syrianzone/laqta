<script lang="ts">
  import "../app.css";
  import { invalidateAll } from "$app/navigation";
  import { signInWithGoogle, signOut } from "$lib/auth-client";

  let { children, data } = $props();

  async function login() {
    await signInWithGoogle(window.location.pathname);
  }

  async function logout() {
    await signOut();
    await invalidateAll();
  }
</script>

<header class="border-b border-neutral-200">
  <nav class="mx-auto flex max-w-6xl items-center justify-between p-4">
    <a href="/" class="text-2xl font-bold">لقطة</a>
    <form action="/search" class="mx-4 hidden flex-1 sm:block">
      <input
        name="q"
        placeholder="ابحث عن صور…"
        class="w-full max-w-md rounded-full border border-neutral-300 px-4 py-1.5 text-sm"
      />
    </form>
    <div class="flex items-center gap-3 text-sm">
      {#if data.user}
        <a href="/dashboard" class="hover:underline">
          {data.user.displayName ?? "حسابي"}
        </a>
        <button onclick={logout} class="rounded bg-neutral-100 px-3 py-1.5">
          تسجيل الخروج
        </button>
      {:else}
        <button onclick={login} class="rounded bg-neutral-900 px-3 py-1.5 text-white">
          الدخول عبر Google
        </button>
      {/if}
    </div>
  </nav>
</header>

{@render children()}
