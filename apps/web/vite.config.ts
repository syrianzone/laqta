import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // The monorepo's single .env lives at the repo root.
  envDir: "../../",
  server: {
    port: 5173,
  },
});
