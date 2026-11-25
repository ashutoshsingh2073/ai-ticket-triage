import { expect, test } from "./fixtures";

// Runs against the second stack, whose backend allows 3 triage requests/min.

test.use({ allowConsoleErrors: /status of 429/ });

test("a real 429 from the backend shows the rate-limit state with Retry-After", async ({ page }) => {
  await page.goto("/");
  const box = page.getByLabel(/incoming message/i);
  const statuses: number[] = [];
  page.on("response", (r) => r.url().endsWith("/api/triage") && statuses.push(r.status()));

  for (let i = 0; i < 4; i++) {
    await box.fill(`Where is my parcel ${i} ${Date.now().toString(36)}?`);
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/triage")),
      page.getByRole("button", { name: /run triage/i }).click(),
    ]);
    await expect(page.getByRole("button", { name: /run triage/i })).toBeEnabled();
  }

  expect(statuses).toEqual([200, 200, 200, 429]);
  const alert = page.getByRole("alert");
  await expect(alert).toHaveAttribute("data-error-kind", "rate_limited");
  await expect(alert).toContainText("Too many requests");
  await expect(alert).toContainText(/Retry in \d+s\./);
});
