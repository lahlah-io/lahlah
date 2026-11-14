import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // SDK PeridotID memakai global Node `Buffer`; sediakan shim browser.
  define: { global: "globalThis" },
  optimizeDeps: { include: ["buffer"] },
  server: { port: 5174, strictPort: true },
});
