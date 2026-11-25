import { useCallback, useMemo } from "react";
import { api } from "../api/client";
import { INTENTS, PRIORITIES } from "../api/types";
import { ErrorPanel } from "../components/ErrorPanel";
import { Scramble } from "../components/Glitch";
import { PageHead } from "../components/Layout";
import { formatCostPaise, formatPercent } from "../lib/format";
import { usePoll } from "../lib/usePoll";
import { useQueue } from "../state/queue";

const POLL_MS = 5_000;

function Meter({ ratio, label }: { ratio: number; label: string }) {
  const cells = 40;
  const on = Math.round(Math.max(0, Math.min(1, ratio)) * cells);
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={i < on ? "on" : ""} />
      ))}
    </div>
  );
}

function Distribution<K extends string>({ keys, counts, total, variant }: { keys: readonly K[]; counts: Record<string, number>; total: number; variant?: boolean }) {
  return (
    <div className="dist">
      {keys.map((k) => {
        const n = counts[k] ?? 0;
        const pct = total ? (n / total) * 100 : 0;
        return (
          <div key={k} style={{ display: "contents" }}>
            <span className="dist__label">{k}</span>
            <span className={`dist__bar ${variant ? `dist__bar--${k}` : ""}`}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className="dist__n">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SystemPage() {
  const fetchMetrics = useCallback((s: AbortSignal) => api.metrics(s), []);
  const fetchHealth = useCallback((s: AbortSignal) => api.health(s), []);
  const metrics = usePoll(fetchMetrics, POLL_MS);
  const health = usePoll(fetchHealth, POLL_MS);
  const { entries } = useQueue();

  const local = useMemo(() => {
    const byPriority: Record<string, number> = {};
    const byIntent: Record<string, number> = {};
    for (const e of entries) {
      byPriority[e.ticket.priority] = (byPriority[e.ticket.priority] ?? 0) + 1;
      byIntent[e.ticket.intent] = (byIntent[e.ticket.intent] ?? 0) + 1;
    }
    return { byPriority, byIntent, total: entries.length };
  }, [entries]);

  const m = metrics.data;
  const updated = metrics.updatedAt ? new Date(metrics.updatedAt).toLocaleTimeString(undefined, { hour12: false }) : "—";

  return (
    <>
      <PageHead
        kicker="04 / telemetry"
        title="System"
        aside={
          <div className="row" style={{ gap: 10 }}>
            <span className="faint mono-num" style={{ fontSize: 12 }}>
              polled every {POLL_MS / 1000}s · last {updated}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                metrics.refresh();
                health.refresh();
              }}
            >
              Refresh
            </button>
          </div>
        }
      >
        Live counters from the API process. They are held in memory, so they reset when the backend restarts.
      </PageHead>

      {metrics.error && !m ? (
        <ErrorPanel error={metrics.error} />
      ) : !m ? (
        <Scramble label="Reading telemetry…" />
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {metrics.error ? (
            <div className="alert alert--warn alert--inline" role="alert" style={{ marginBottom: 16 }}>
              Lost contact with the API — showing the last values received at {updated}.
            </div>
          ) : null}

          <div className="stats" data-testid="metrics">
            <div className="stat">
              <div className="stat__label">Requests</div>
              <div className="stat__value" data-testid="m-requests">{m.requests}</div>
              <div className="stat__note">a batch counts as one</div>
            </div>
            <div className="stat stat--cyan">
              <div className="stat__label">Model calls</div>
              <div className="stat__value" data-testid="m-llm">{m.llmCalls}</div>
              <div className="stat__note">cache misses that reached the model</div>
            </div>
            <div className="stat">
              <div className="stat__label">Est. spend</div>
              <div className="stat__value" style={{ fontSize: 38 }} data-testid="m-cost">{formatCostPaise(m.costPaise)}</div>
              <div className="stat__note mono-num">{m.costPaise.toFixed(3)} paise</div>
            </div>
            <div className={`stat ${m.blocked ? "stat--red" : ""}`}>
              <div className="stat__label">Injections blocked</div>
              <div className="stat__value" data-testid="m-blocked">{m.blocked}</div>
            </div>
            <div className={`stat ${m.failures ? "stat--red" : ""}`}>
              <div className="stat__label">Failures</div>
              <div className="stat__value" data-testid="m-failures">{m.failures}</div>
              <div className="stat__note">routed to human review</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 28 }}>
            <section className="panel panel--marked" aria-label="Cache">
              <div className="panel__head">
                <strong>Response cache</strong>
                <span>LRU + TTL</span>
              </div>
              <div className="panel__body stack">
                <div className="row row--between">
                  <span className="eyebrow">Hit rate</span>
                  <span className="stat__value" style={{ fontSize: 40, color: "var(--acid)" }} data-testid="m-hitrate">
                    {formatPercent(m.cache.hitRate)}
                  </span>
                </div>
                <Meter ratio={m.cache.hitRate} label="Cache hit rate" />
                <dl className="kv">
                  <dt>Entries</dt>
                  <dd className="mono-num">{m.cache.size}</dd>
                  <dt>Hits</dt>
                  <dd className="mono-num">{m.cache.hits}</dd>
                  <dt>Misses</dt>
                  <dd className="mono-num">{m.cache.misses}</dd>
                </dl>
              </div>
            </section>

            <section className="panel" aria-label="Service">
              <div className="panel__head">
                <strong>Service</strong>
                <span data-testid="health-status">{health.error ? "unreachable" : (health.data?.status ?? "…")}</span>
              </div>
              <div className="panel__body">
                <dl className="kv">
                  <dt>Provider</dt>
                  <dd className="big" data-testid="health-provider">{health.data?.provider ?? "—"}</dd>
                  <dt>Mode</dt>
                  <dd className="muted">
                    {health.data?.provider === "mock"
                      ? "Rule-based extractor. No API key, no network, no spend — numbers are estimates."
                      : health.data?.provider === "openai"
                        ? "Live model via structured output, validated and retried once."
                        : "—"}
                  </dd>
                </dl>
              </div>
            </section>
          </div>

          <div className="grid-2" style={{ marginTop: 28 }}>
            <section className="panel" aria-label="Priority mix">
              <div className="panel__head">
                <strong>Priority mix</strong>
                <span>this browser · {local.total}</span>
              </div>
              <div className="panel__body">
                {local.total ? <Distribution keys={PRIORITIES} counts={local.byPriority} total={local.total} variant /> : <span className="faint">No tickets yet.</span>}
              </div>
            </section>
            <section className="panel" aria-label="Intent mix">
              <div className="panel__head">
                <strong>Intent mix</strong>
                <span>this browser · {local.total}</span>
              </div>
              <div className="panel__body">
                {local.total ? <Distribution keys={INTENTS} counts={local.byIntent} total={local.total} /> : <span className="faint">No tickets yet.</span>}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
