import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isAbort } from "../api/client";

export type PollState<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
};

/**
 * Fetch now, then every `intervalMs`. Pauses while the tab is hidden, never
 * overlaps requests, and cancels in-flight work on unmount.
 */
export function usePoll<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(run, intervalMs);
        return;
      }
      try {
        const result = await fetcherRef.current(controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (controller.signal.aborted || isAbort(err)) return;
        setError(err instanceof ApiError ? err : new ApiError("unknown", String(err)));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(run, intervalMs);
        }
      }
    };
    run();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [intervalMs, tick]);

  return { data, error, loading, updatedAt, refresh };
}
