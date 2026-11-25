import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Ticket, TriageResponse } from "../api/types";

/**
 * The backend keeps no history, so the queue lives in the browser.
 * Only the extracted ticket is stored — never the raw message, which may
 * contain the personal data the backend redacts.
 */
export type QueueEntry = {
  id: string;
  at: string;
  source: "single" | "batch";
  ticket: Ticket;
  cached: boolean;
  redacted: string[];
  costPaise: number;
  resolved: boolean;
};

const STORAGE_KEY = "triage.queue.v1";
const MAX_ENTRIES = 500;

type Action =
  | { type: "add"; entries: QueueEntry[] }
  | { type: "toggle"; id: string }
  | { type: "remove"; id: string }
  | { type: "clear" };

function reducer(state: QueueEntry[], action: Action): QueueEntry[] {
  switch (action.type) {
    case "add":
      return [...action.entries, ...state].slice(0, MAX_ENTRIES);
    case "toggle":
      return state.map((e) => (e.id === action.id ? { ...e, resolved: !e.resolved } : e));
    case "remove":
      return state.filter((e) => e.id !== action.id);
    case "clear":
      return [];
  }
}

function isEntry(v: unknown): v is QueueEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<QueueEntry>;
  return typeof e.id === "string" && typeof e.at === "string" && !!e.ticket && typeof e.ticket.intent === "string";
}

function load(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let counter = 0;
function newId(): string {
  counter = (counter + 1) % 1_000_000;
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${counter}-${rand}`;
}

export function toEntry(res: TriageResponse, source: QueueEntry["source"]): QueueEntry {
  return {
    id: newId(),
    at: new Date().toISOString(),
    source,
    ticket: res.ticket,
    cached: res.meta.cached,
    redacted: res.meta.redacted,
    costPaise: res.meta.usage.costPaise,
    resolved: false,
  };
}

type QueueApi = {
  entries: QueueEntry[];
  add: (responses: TriageResponse[], source: QueueEntry["source"]) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const QueueContext = createContext<QueueApi | null>(null);

export function QueueProvider({ children, initial }: { children: ReactNode; initial?: QueueEntry[] }) {
  const [entries, dispatch] = useReducer(reducer, initial, (init) => init ?? load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // storage full or blocked — the queue still works for this session
    }
  }, [entries]);

  const add = useCallback((responses: TriageResponse[], source: QueueEntry["source"]) => {
    if (responses.length === 0) return;
    // Batch results arrive in index order; newest-first means reverse them.
    dispatch({ type: "add", entries: responses.map((r) => toEntry(r, source)).reverse() });
  }, []);
  const toggle = useCallback((id: string) => dispatch({ type: "toggle", id }), []);
  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const value = useMemo(() => ({ entries, add, toggle, remove, clear }), [entries, add, toggle, remove, clear]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue(): QueueApi {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("useQueue must be used inside <QueueProvider>");
  return ctx;
}

export { STORAGE_KEY };
