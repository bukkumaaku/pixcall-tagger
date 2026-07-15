import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",
  server: {
    port: 1422,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    // Keep a running plugin's worker directory from being removed mid-build.
    emptyOutDir: false,
  },
});
