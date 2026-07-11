<script lang="ts">
  import { enhance } from "$app/forms";
  let { data, form } = $props();
  const p = data.profile;
</script>

<svelte:head><title>الملف الشخصي — لقطة</title></svelte:head>

<h1 class="mb-4 text-xl font-bold">الملف الشخصي</h1>

{#if form?.ok}
  <p class="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm">تم الحفظ.</p>
{/if}

<form method="POST" action="?/save" use:enhance class="max-w-lg space-y-4">
  <div>
    <label class="mb-1 block text-sm text-neutral-600" for="displayName">الاسم المعروض</label>
    <input id="displayName" name="displayName" value={p?.displayName ?? ""} class="w-full rounded border px-3 py-2 text-sm" />
  </div>
  <div>
    <label class="mb-1 block text-sm text-neutral-600" for="creditFormat">صيغة النَّسب المفضّلة</label>
    <input id="creditFormat" name="creditFormat" value={p?.creditFormat ?? ""} placeholder="مثال: اسمك (رابط ملفك)" class="w-full rounded border px-3 py-2 text-sm" />
  </div>
  <div>
    <label class="mb-1 block text-sm text-neutral-600" for="bio">نبذة</label>
    <textarea id="bio" name="bio" rows="3" class="w-full rounded border px-3 py-2 text-sm">{p?.bio ?? ""}</textarea>
  </div>
  <button class="rounded bg-neutral-900 px-5 py-2 text-sm text-white">حفظ</button>
</form>

<hr class="my-8" />

<section class="max-w-lg">
  <h2 class="mb-2 text-sm font-semibold text-red-700">حذف الحساب</h2>
  <p class="mb-3 text-sm text-neutral-500">
    سيؤدي حذف الحساب إلى إزالة جميع بياناتك الشخصية وكل الصور التي رفعتها نهائيًا.
  </p>
  <form
    method="POST"
    action="?/deleteAccount"
    use:enhance={() => {
      if (!confirm("هل أنت متأكد؟ لا يمكن التراجع.")) return ({ cancel }) => cancel();
      return async ({ result, update }) => {
        if (result.type === "success") window.location.href = "/";
        else await update();
      };
    }}
  >
    <button class="rounded border border-red-300 px-4 py-2 text-sm text-red-700">حذف حسابي نهائيًا</button>
  </form>
</section>
