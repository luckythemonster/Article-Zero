import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Minimal `process` shape — this repo doesn't pull in @types/node, and the
// config only needs the Codespaces env vars to wire HMR back through the
// port-forwarded preview domain.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: process.env.CODESPACES
      ? {
          host: process.env.CODESPACE_NAME + ".preview.app.github.com",
          port: 443,
          protocol: "wss",
        }
      : undefined,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
