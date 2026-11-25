import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";
import { BatchRequest, TriageRequest, type Ticket } from "./schema.js";
import { extractor, ExtractionError, type ExtractResult } from "./extractor.js";
import { LruTtlCache, cacheKey } from "./cache.js";
import { detectInjection, redactPII } from "./guardrails.js";

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const cache = new LruTtlCache<ExtractResult>();

/** Running totals, so cost is visible per deploy rather than at the end of the month. */
const metrics = { requests: 0, llmCalls: 0, costPaise: 0, blocked: 0, failures: 0 };

const hits = new Map<string, { count: number; windowStart: number }>();
function rateLimit(limit = config.RATE_LIMIT_PER_MINUTE, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      return next();
    }
    if (++entry.count > limit) {
      res.setHeader("Retry-After", Math.ceil((entry.windowStart + windowMs - now) / 1000));
      return next(new AppError(429, "Too many requests"));
    }
    next();
  };
}

export type TriageResponse = {
  ticket: Ticket;
  meta: {
    cached: boolean;
    attempts: number;
    redacted: string[];
    usage: ExtractResult["usage"];
  };
};

/** One message through the whole pipeline: guardrail → cache → model → validate. */
async function triageOne(rawMessage: string): Promise<TriageResponse> {
  const injection = detectInjection(rawMessage);
  if (injection) {
    metrics.blocked++;
    throw new AppError(422, "This message looks like a prompt-injection attempt and was not processed.");
  }

  const { text: message, redacted } = redactPII(rawMessage);
  const key = cacheKey(config.MODEL, message);

  const cached = cache.get(key);
  if (cached) {
    return { ticket: cached.ticket, meta: { cached: true, attempts: 0, redacted, usage: { inputTokens: 0, outputTokens: 0, costPaise: 0 } } };
  }

  const result = await extractor.extract(message);
  cache.set(key, result);
  metrics.llmCalls++;
  metrics.costPaise = Number((metrics.costPaise + result.usage.costPaise).toFixed(3));

  return { ticket: result.ticket, meta: { cached: false, attempts: result.attempts, redacted, usage: result.usage } };
}

/** Bounded-concurrency map: 50 messages must not open 50 connections at once. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", provider: config.LLM_PROVIDER, cache: cache.stats });
  });

  app.get("/metrics", (_req, res) => {
    res.json({ ...metrics, cache: cache.stats });
  });

  app.post("/triage", rateLimit(), async (req, res) => {
    const body = TriageRequest.safeParse(req.body);
    if (!body.success) throw new AppError(400, body.error.issues[0]!.message);
    metrics.requests++;
    res.json(await triageOne(body.data.message));
  });

  app.post("/triage/batch", rateLimit(), async (req, res) => {
    const body = BatchRequest.safeParse(req.body);
    if (!body.success) throw new AppError(400, body.error.issues[0]!.message);
    metrics.requests++;

    // One bad message must not fail the whole batch.
    const results = await mapWithLimit(body.data.messages, config.BATCH_CONCURRENCY, async (message, index) => {
      try {
        return { index, ok: true as const, ...(await triageOne(message)) };
      } catch (err) {
        metrics.failures++;
        const message = err instanceof AppError || err instanceof ExtractionError ? err.message : "Extraction failed";
        return { index, ok: false as const, error: message };
      }
    });

    res.json({
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      results,
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ExtractionError) {
      metrics.failures++;
      return res.status(502).json({ error: "Could not classify this message", fallback: "human_review" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export { cache, metrics };
