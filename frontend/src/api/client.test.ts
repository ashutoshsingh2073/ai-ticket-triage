import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, triageResult } from "../test/utils";
import { ApiError, api, isAbort } from "./client";

afterEach(() => vi.unstubAllGlobals());

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected rejection");
}

describe("api client", () => {
  it("POSTs JSON to /api/triage and returns the body", async () => {
    const fetch = mockFetch({ "POST /triage": () => jsonResponse(triageResult()) });
    const res = await api.triage("hello");
    expect(res.ticket.orderId).toBe("A-4471");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/triage");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ message: "hello" });
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends batch messages as an array", async () => {
    const fetch = mockFetch({ "POST /triage/batch": () => jsonResponse({ total: 0, succeeded: 0, results: [] }) });
    await api.triageBatch(["a", "b"]);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ messages: ["a", "b"] });
  });

  it.each([
    [400, "validation"],
    [422, "blocked"],
    [429, "rate_limited"],
    [502, "extraction_failed"],
    [500, "server"],
    [404, "unknown"],
  ] as const)("maps HTTP %i to %s and keeps the server message", async (status, kind) => {
    mockFetch({ "POST /triage": () => jsonResponse({ error: `boom ${status}` }, status) });
    const err = await failure(api.triage("x"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
    expect(err.message).toBe(`boom ${status}`);
  });

  it("reads Retry-After on 429", async () => {
    mockFetch({ "POST /triage": () => jsonResponse({ error: "Too many requests" }, 429, { "Retry-After": "17" }) });
    expect((await failure(api.triage("x"))).retryAfterSec).toBe(17);
  });

  it("surfaces the human_review fallback on 502", async () => {
    mockFetch({ "POST /triage": () => jsonResponse({ error: "Could not classify", fallback: "human_review" }, 502) });
    expect((await failure(api.triage("x"))).fallback).toBe("human_review");
  });

  it("handles a non-JSON error body", async () => {
    mockFetch({ "GET /health": () => new Response("<html>Bad Gateway</html>", { status: 502 }) });
    const err = await failure(api.health());
    expect(err.kind).toBe("extraction_failed");
    expect(err.message).toBe("Request failed with status 502");
  });

  it("rejects a 200 with an empty body", async () => {
    mockFetch({ "GET /metrics": () => new Response("", { status: 200 }) });
    expect((await failure(api.metrics())).kind).toBe("unknown");
  });

  it("reports an unreachable backend as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await failure(api.health());
    expect(err.kind).toBe("network");
  });

  it("propagates caller cancellation as an AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))),
    );
    const controller = new AbortController();
    const p = api.triage("x", controller.signal);
    controller.abort();
    const err = await failure(p);
    expect(isAbort(err)).toBe(true);
  });

  it("times out a request that never answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))),
    );
    const p = failure(api.triage("x"));
    await vi.advanceTimersByTimeAsync(30_001);
    expect((await p).kind).toBe("timeout");
    vi.useRealTimers();
  });
});
