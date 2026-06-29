import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@bsm", replacement: path.resolve(__dirname, "src") },
      { find: "next/link", replacement: path.resolve(__dirname, "src/shims/next-link.tsx") },
      {
        find: "@/app/lib/lib/supabaseClient",
        replacement: path.resolve(__dirname, "src/lib/supabaseClient.ts"),
      },
      {
        find: "@/app/components/games/gameLeaderboardStorage",
        replacement: path.resolve(__dirname, "src/lib/bsmLeaderboardStorage.ts"),
      },
      { find: "@", replacement: repoRoot },
    ],
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
