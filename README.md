# AI Ticket Triage

A service that turns a free-text support message into a **validated, typed ticket** — intent, priority, sentiment, order ID, amount, summary — with caching, guardrails, cost tracking and a field-level evaluation harness.

TypeScript, Express, Zod. Runs with **no API key and no network** in mock mode.

```bash
npm install
npm test        # 12 tests
npm run eval    # per-field accuracy + confusion matrices
npm run dev     # http://localhost:3100
```

```bash
curl -s localhost:3100/triage -H 'content-type: application/json' \
  -d '{"message":"I was charged twice for order A-4471, ₹1299 each time. Fix this now."}' | jq
```

```json
{
  "ticket": {
    "intent": "billing",
    "priority": "high",
    "sentiment": "neutral",
    "orderId": "A-4471",
    "amountPaise": 129900,
    "summary": "I was charged twice for order A-4471, ₹1299 each time"
  },
  "meta": { "cached": false, "attempts": 1, "redacted": [], "usage": { "costPaise": 1.2 } }
}
```

---

## Why this shape

Structured extraction is the most reliable thing an LLM does in a product: the output is a schema, so normal code can act on it. The interesting work is everything wrapped around the model call.

| Concern | How it is handled |
|---|---|
| The model returns the wrong shape | One Zod schema constrains the output, validates it at runtime, and generates the TypeScript type. Invalid output is retried once, then fails to `human_review` rather than returning garbage |
| Duplicate messages cost money | Content-addressed LRU + TTL cache: identical messages are free and instant |
| Prompt injection | Input is checked for injection patterns and rejected with 422 before any model call |
| Personal data leaving the system | Emails, phone numbers and card numbers are redacted before the prompt is built |
| One bad message in a batch | Bounded-concurrency batch endpoint returns per-item success or failure, never one global 500 |
| Nobody knows what this costs | Token and cost estimates per request, running totals and cache hit rate on `/metrics` |
| A prompt change breaks classification | Field-level evals with confusion matrices; CI fails if any high-priority ticket is missed |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| POST | `/triage` | One message in, a validated ticket out |
| POST | `/triage/batch` | Up to 50 messages, processed with bounded concurrency |
| GET | `/metrics` | Requests, model calls, estimated spend, cache hit rate |
| GET | `/health` | Provider and cache stats |

## Evaluation

```
$ npm run eval

Triage evaluation
-----------------
Examples: 15
  intent        100%  (12/12)
  priority      100%  (6/6)
  sentiment     100%  (4/4)
  orderId       100%  (9/9)
  amountPaise   100%  (3/3)
Estimated cost: ₹0.0522 for 15 messages

Priority (rows = expected, columns = predicted)
          high      low       medium
high      4         0         0
low       0         1         0
medium    0         0         1

Missed high-priority tickets: 0
Quality gates passed.
```

Two things worth saying out loud about this output:

1. **A single accuracy number hides the failure that matters.** A classifier can score 90% overall and still miss every high-priority ticket — the one case that costs real money. So the CI gate is "zero missed high-priority tickets", not "accuracy above X".
2. **100% in mock mode is not a real score.** The mock extractor is rule-based and those rules were written against this dataset, so the number proves the harness works, not that the classifier is good. The honest number comes from `LLM_PROVIDER=openai` with the same dataset, and from growing the dataset out of real production failures.

## Mock mode

`LLM_PROVIDER=mock` swaps one implementation behind the `Extractor` interface: rules instead of `withStructuredOutput`. Caching, guardrails, validation, batching, metrics and the HTTP layer are the same code in both modes, so tests and CI need no key, no network and no spend.

## Tests

`npm test` covers schema validity, cache hit and LRU eviction, TTL expiry, injection blocking, PII redaction, partial batch failure, oversized batch rejection, and the metrics endpoint.

## Deployment

Multi-stage `Dockerfile` (non-root, healthcheck), `docker-compose.yml`, and GitHub Actions running typecheck → tests → evals → build.

## What I would add next

- Redis instead of the in-process cache, so the hit rate survives multiple instances
- A queue for the batch endpoint, returning a job ID instead of holding the request open
- LangSmith tracing, and sampling live traffic into the eval dataset
- Few-shot examples picked per intent, and a smaller model routed by message length
# ai-ticket-triage
