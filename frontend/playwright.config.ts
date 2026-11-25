import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real UI against the real backend (mock LLM
// provider, so no key or spend). Two stacks run side by side:
//   main      — normal rate limit, used for every flow
//   ratelimit — RATE_LIMIT_PER_MINUTE=3, to provoke a genuine 429
const ROOT = "..";
const MAIN = { api: 3199, web: 5199 };
const RL = { api: 3198, web: 5198 };

const backend = (port: number, extra: Record<string, string> = {}) => ({
  command: "npx tsx src/server.ts",
  cwd: ROOT,
  url: `http://localhost:${port}/health`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: { PORT: String(port), LLM_PROVIDER: "mock", NODE_ENV: "development", ...extra },
});

const frontend = (port: number, apiPort: number) => ({
  command: `npx vite --port ${port} --strictPort`,
  url: `http://localhost:${port}`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: { API_PROXY_TARGET: `http://localhost:${apiPort}` },
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // backend metrics are process-global; keep assertions deterministic
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL: `http://localhost:${MAIN.web}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /rate-limit/,
    },
    {
      name: "rate-limit",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${RL.web}` },
      testMatch: /rate-limit/,
    },
  ],
  webServer: [
    backend(MAIN.api, { RATE_LIMIT_PER_MINUTE: "10000" }),
    frontend(MAIN.web, MAIN.api),
    backend(RL.api, { RATE_LIMIT_PER_MINUTE: "3" }),
    frontend(RL.web, RL.api),
  ],
});
