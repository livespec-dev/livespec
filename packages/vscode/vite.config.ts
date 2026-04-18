import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const webviewRoot = path.resolve(packageRoot, "webview");

export default defineConfig({
  root: webviewRoot,
  plugins: [react()],
  build: {
    outDir: path.resolve(packageRoot, "webview", "dist"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/webview.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  resolve: {
    alias: {
      "@webview": path.resolve(webviewRoot, "src")
    }
  }
});
