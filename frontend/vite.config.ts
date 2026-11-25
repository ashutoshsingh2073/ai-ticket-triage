/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The backend has no CORS headers, so the browser talks to Vite and Vite
// forwards /api/* to the API. Same setup for `vite` and `vite preview`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET || "http://localhost:3100";
  const proxy = {
    "/api": {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
    },
  };

  return {
    plugins: [react()],
    server: { port: Number(env.FRONTEND_PORT) || 5173, proxy },
    preview: { port: Number(env.FRONTEND_PORT) || 4173, proxy },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
    },
  };
});
