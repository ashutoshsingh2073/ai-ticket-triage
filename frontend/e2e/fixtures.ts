import { test as base, expect } from "@playwright/test";

/**
 * Every UI test fails if the page logs a console error or throws.
 * Errors from deliberately-failed network requests are allowed through
 * by tests that opt in with `allowConsoleErrors`.
 */
export const test = base.extend<{ consoleErrors: string[]; allowConsoleErrors: RegExp | null }>({
  allowConsoleErrors: [null, { option: true }],
  consoleErrors: async ({ page, allowConsoleErrors }, use) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (allowConsoleErrors && allowConsoleErrors.test(text)) return;
      errors.push(text);
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await use(errors);
    expect(errors, "console errors during test").toEqual([]);
  },
});

export { expect };
