import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { TriageResponse } from "../api/types";
import { App } from "../App";
import { QueueProvider, type QueueEntry } from "../state/queue";

export function renderApp(path = "/", initial?: QueueEntry[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueueProvider initial={initial}>
        <App />
      </QueueProvider>
    </MemoryRouter>,
  );
}

export function renderWithProviders(ui: ReactElement, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueueProvider initial={[]}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </QueueProvider>
    </MemoryRouter>,
  );
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Route fetch calls by path suffix; unknown routes fail the test loudly. */
export function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^.*\/api/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unmocked fetch: ${method} ${path}`);
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const HEALTH = { status: "ok", provider: "mock", cache: { size: 0, hits: 0, misses: 0, hitRate: 0 } };

export function triageResult(overrides: Partial<TriageResponse["ticket"]> = {}, meta: Partial<TriageResponse["meta"]> = {}): TriageResponse {
  return {
    ticket: {
      intent: "billing",
      priority: "high",
      sentiment: "neutral",
      orderId: "A-4471",
      amountPaise: 129900,
      summary: "I was charged twice for order A-4471",
      ...overrides,
    },
    meta: { cached: false, attempts: 1, redacted: [], usage: { inputTokens: 100, outputTokens: 30, costPaise: 0.286 }, ...meta },
  };
}

export function entry(id: string, ticket: Partial<TriageResponse["ticket"]>, extra: Partial<QueueEntry> = {}): QueueEntry {
  const r = triageResult(ticket);
  return {
    id,
    at: extra.at ?? new Date(2026, 0, 1, 12, 0, Number(id.replace(/\D/g, "")) || 0).toISOString(),
    source: "single",
    ticket: r.ticket,
    cached: false,
    redacted: [],
    costPaise: 0.2,
    resolved: false,
    ...extra,
  };
}
