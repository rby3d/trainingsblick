import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
// Build-Ziel: ../web/index.html (eine einzige Datei, vom Script ausgeliefert und mit eingecheckt)
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: "../web", emptyOutDir: true, target: "es2020" },
});
