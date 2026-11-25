# TRIAGE//SIGNAL — frontend

React 19 + Vite + TypeScript UI for the triage API, in a "glitch" (broken-broadcast) theme.

```bash
# terminal 1 — API on :3100
cd .. && npm run dev

# terminal 2 — UI on :5173
npm install
npm run dev
```

The API has no CORS headers, so the browser calls `/api/*` on Vite and Vite proxies it to
`API_PROXY_TARGET` (default `http://localhost:3100`). The same proxy is configured for `vite preview`.
To call an API on another origin directly, set `VITE_API_BASE_URL` at build time; that API must then send CORS headers.

## Screens

| Route | What it does |
|---|---|
| `/` Triage | One message → ticket. Samples for every backend path (billing, PII, injection…). `Ctrl+Enter` submits |
| `/batch` | Up to 50 messages, paste or drop `.txt`/`.csv`. Per-item results, filters, CSV export |
| `/queue` | Every ticket triaged in this browser (localStorage). Filter, search, sort, resolve, clear |
| `/system` | Live `/metrics` and `/health`, polled every 5s, plus intent/priority mix |

`Alt+1…4` switches screens. Every API error has its own state: 400, 422 (injection blocked),
429 (with Retry-After), 502 (human-review fallback), network down, and timeout.

The queue stores only the extracted ticket, never the raw message, so the personal data the backend redacts is not kept in the browser.

## Tests

```bash
npm test          # 46 unit + component tests (Vitest, jsdom, mocked fetch)
npm run test:e2e  # 23 Playwright tests against the real backend (starts it for you)
```

The e2e suite starts two backend+UI pairs: one for all flows, and one with `RATE_LIMIT_PER_MINUTE=3` to provoke a real 429.
It fails any test that logs a console error.
