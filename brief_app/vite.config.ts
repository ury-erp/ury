import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built into the Frappe app's public folder; served at /assets/ury/brief/dist/.
// File names are fixed (no hashes) so www/brief.html can reference them; the
// page adds ?v=<build_version> for cache busting.
export default defineConfig({
  plugins: [react()],
  base: "/assets/ury/brief/dist/",
  build: {
    outDir: "../ury/public/brief/dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        // One file: a lazy chunk would import ./app.js without ?v= and pair with a stale cached copy after a rebuild.
        inlineDynamicImports: true,
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (a) => (a.names?.[0]?.endsWith(".css") ? "assets/app.css" : "assets/[name][extname]"),
      },
    },
  },
  server: { proxy: { "/api": "http://localhost:8002" } },
});
