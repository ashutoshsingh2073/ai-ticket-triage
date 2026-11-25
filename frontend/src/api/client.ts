import type { BatchResponse, HealthResponse, MetricsResponse, TriageResponse } from "./types";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";
const TIMEOUT_MS = 30_000;

export type ApiErrorKind =
  | "validation" // 400
  | "blocked" // 422 prompt injection
  | "rate_limited" // 429
  | "extraction_failed" // 502, needs a human
  | "server" // other 5xx
  | "network" // backend unreachable
  | "timeout"
  | "unknown";

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status: number | null = null,
    public retryAfterSec: number | null = null,
    public fallback: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function kindFor(status: number): ApiErrorKind {
  if (status === 400) return "validation";
  if (status === 422) return "blocked";
  if (status === 429) return "rate_limited";
  if (status === 502) return "extraction_failed";
  if (status >= 500) return "server";
  return "unknown";
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled — let them see an AbortError
    if (controller.signal.aborted) throw new ApiError("timeout", `No response after ${TIMEOUT_MS / 1000}s`);
    throw new ApiError("network", "Cannot reach the triage API. Is the backend running?");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const b = (body ?? {}) as { error?: unknown; fallback?: unknown };
    const message = typeof b.error === "string" ? b.error : `Request failed with status ${res.status}`;
    const retry = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      kindFor(res.status),
      message,
      res.status,
      Number.isFinite(retry) && retry > 0 ? retry : null,
      typeof b.fallback === "string" ? b.fallback : null,
    );
  }

  if (body === null) throw new ApiError("unknown", "The API returned an empty or non-JSON response", res.status);
  return body as T;
}

export const api = {
  triage: (message: string, signal?: AbortSignal) =>
    request<TriageResponse>("/triage", { method: "POST", body: JSON.stringify({ message }) }, signal),
  triageBatch: (messages: string[], signal?: AbortSignal) =>
    request<BatchResponse>("/triage/batch", { method: "POST", body: JSON.stringify({ messages }) }, signal),
  health: (signal?: AbortSignal) => request<HealthResponse>("/health", {}, signal),
  metrics: (signal?: AbortSignal) => request<MetricsResponse>("/metrics", {}, signal),
};

export function isAbort(err: unknown): boolean {
  // Duck-typed: DOMException differs across realms (iframes, jsdom, Node).
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}
