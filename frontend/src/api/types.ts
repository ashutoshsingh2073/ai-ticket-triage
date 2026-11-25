// Mirrors src/schema.ts and src/app.ts in the backend. If the backend schema
// changes, this is the one file to update.

export const INTENTS = ["refund", "bug", "billing", "delivery", "account", "question", "other"] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;
export const SENTIMENTS = ["angry", "neutral", "happy"] as const;

export type Intent = (typeof INTENTS)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Sentiment = (typeof SENTIMENTS)[number];

export type Ticket = {
  intent: Intent;
  priority: Priority;
  sentiment: Sentiment;
  orderId: string | null;
  amountPaise: number | null;
  summary: string;
};

export type Usage = { inputTokens: number; outputTokens: number; costPaise: number };

export type TriageResponse = {
  ticket: Ticket;
  meta: {
    cached: boolean;
    attempts: number;
    redacted: string[];
    usage: Usage;
  };
};

export type BatchItemOk = { index: number; ok: true } & TriageResponse;
export type BatchItemFail = { index: number; ok: false; error: string };
export type BatchItem = BatchItemOk | BatchItemFail;

export type BatchResponse = {
  total: number;
  succeeded: number;
  results: BatchItem[];
};

export type CacheStats = { size: number; hits: number; misses: number; hitRate: number };

export type HealthResponse = {
  status: string;
  provider: "mock" | "openai" | string;
  cache: CacheStats;
};

export type MetricsResponse = {
  requests: number;
  llmCalls: number;
  costPaise: number;
  blocked: number;
  failures: number;
  cache: CacheStats;
};

/** Limits enforced by the backend's Zod request schemas. */
export const LIMITS = {
  messageMax: 5000,
  batchMax: 50,
} as const;
