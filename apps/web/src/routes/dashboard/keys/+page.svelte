<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
</script>

<svelte:head><title>مفاتيح API — لقطة</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">مفاتيح المطوّرين</h1>
<p class="mb-6 text-sm text-neutral-500">
  استخدم مفاتيح API للوصول إلى الكتالوج برمجيًا عبر <code>/api/v1</code>.
</p>

{#if form?.createdKey}
  <div class="mb-6 rounded border border-green-300 bg-green-50 p-4 text-sm">
    <p class="font-semibold">تم إنشاء المفتاح — انسخه الآن، لن يظهر مجددًا:</p>
    <code class="mt-2 block break-all rounded bg-white p-2">{form.createdKey}</code>
  </div>
{/if}

<form method="POST" action="?/create" use:enhance class="mb-8 flex gap-2">
  <input name="name" placeholder="اسم التطبيق" class="flex-1 rounded border px-3 py-2 text-sm" />
  <button class="rounded bg-neutral-900 px-4 py-2 text-sm text-white">إنشاء مفتاح</button>
</form>

{#if data.keys.length === 0}
  <p class="text-neutral-400">لا توجد مفاتيح بعد.</p>
{:else}
  <table class="w-full text-sm">
    <thead class="text-neutral-400">
      <tr class="text-right">
        <th class="py-2">الاسم</th><th>البادئة</th><th>الحالة</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each data.keys as k (k.id)}
        <tr class="border-t">
          <td class="py-2">{k.name}</td>
          <td><code>laqta_{k.prefix}_…</code></td>
          <td>{k.revokedAt ? "ملغى" : "فعّال"}</td>
          <td class="text-left">
            {#if !k.revokedAt}
              <form method="POST" action="?/revoke" use:enhance>
                <input type="hidden" name="id" value={k.id} />
                <button class="text-red-600 hover:underline">إلغاء</button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
