import { defineConfig } from "vitest/config";

// Backend tests only. The frontend has its own Vitest config in frontend/.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
