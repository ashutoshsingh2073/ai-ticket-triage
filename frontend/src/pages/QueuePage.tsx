import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { INTENTS, PRIORITIES, SENTIMENTS, type Intent, type Priority, type Sentiment } from "../api/types";
import { PageHead } from "../components/Layout";
import { IntentTag, PriorityTag, SentimentTag } from "../components/Tags";
import { formatPaise, formatTime } from "../lib/format";
import { useQueue } from "../state/queue";

type StatusFilter = "open" | "resolved" | "all";
type Sort = "priority" | "newest";

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function QueuePage() {
  const { entries, toggle, remove, clear } = useQueue();
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<Priority | "any">("any");
  const [intent, setIntent] = useState<Intent | "any">("any");
  const [sentiment, setSentiment] = useState<Sentiment | "any">("any");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [sort, setSort] = useState<Sort>("priority");
  const [confirmClear, setConfirmClear] = useState(false);

  // Disarm the destructive button if the user does not confirm quickly.
  useEffect(() => {
    if (!confirmClear) return;
    const id = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(id);
  }, [confirmClear]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((e) => (status === "all" ? true : status === "open" ? !e.resolved : e.resolved))
      .filter((e) => priority === "any" || e.ticket.priority === priority)
      .filter((e) => intent === "any" || e.ticket.intent === intent)
      .filter((e) => sentiment === "any" || e.ticket.sentiment === sentiment)
      .filter(
        (e) =>
          !needle ||
          e.ticket.summary.toLowerCase().includes(needle) ||
          (e.ticket.orderId ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        sort === "priority"
          ? RANK[a.ticket.priority] - RANK[b.ticket.priority] || b.at.localeCompare(a.at)
          : b.at.localeCompare(a.at),
      );
  }, [entries, q, priority, intent, sentiment, status, sort]);

  const open = entries.filter((e) => !e.resolved);
  const openHigh = open.filter((e) => e.ticket.priority === "high").length;
  const filtersActive = q || priority !== "any" || intent !== "any" || sentiment !== "any";

  return (
    <>
      <PageHead
        kicker="03 / work queue"
        title="Queue"
        aside={
          <div className="row" style={{ gap: 24 }}>
            <div>
              <div className="eyebrow">Open</div>
              <div className="stat__value" data-testid="queue-open">{open.length}</div>
            </div>
            <div>
              <div className="eyebrow">Open · high</div>
              <div className="stat__value" style={{ color: openHigh ? "var(--red)" : undefined }}>
                {openHigh}
              </div>
            </div>
          </div>
        }
      >
        Every ticket triaged from this browser, highest priority first. Stored locally — only the extracted ticket is kept, never
        the original message.
      </PageHead>

      {entries.length === 0 ? (
        <div className="void">
          <div>
            <div className="void__big">QUEUE EMPTY</div>
            <p style={{ margin: "10px 0 18px" }}>Nothing has come through yet.</p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link to="/" className="btn">Triage a message</Link>
              <Link to="/batch" className="btn btn--ghost">Run a batch</Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="sr-only" htmlFor="queue-search">Search</label>
            <input
              id="queue-search"
              className="input"
              type="search"
              placeholder="Search summary or order ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="sr-only" htmlFor="f-priority">Priority</label>
            <select id="f-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "any")}>
              <option value="any">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-intent">Intent</label>
            <select id="f-intent" className="select" value={intent} onChange={(e) => setIntent(e.target.value as Intent | "any")}>
              <option value="any">Any intent</option>
              {INTENTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-sentiment">Sentiment</label>
            <select id="f-sentiment" className="select" value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment | "any")}>
              <option value="any">Any sentiment</option>
              {SENTIMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="row row--between" style={{ marginBottom: 14 }}>
            <div className="row">
              <div className="segmented" role="group" aria-label="Status">
                {(["open", "resolved", "all"] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{s}</button>
                ))}
              </div>
              <div className="segmented" role="group" aria-label="Sort">
                {(["priority", "newest"] as const).map((s) => (
                  <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="faint mono-num" style={{ fontSize: 12 }} data-testid="queue-showing">
                {rows.length} of {entries.length}
              </span>
              {filtersActive ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setQ("");
                    setPriority("any");
                    setIntent("any");
                    setSentiment("any");
                  }}
                >
                  Reset filters
                </button>
              ) : null}
              <button
                type="button"
                className={`btn btn--sm ${confirmClear ? "btn--danger" : "btn--ghost"}`}
                onClick={() => {
                  if (confirmClear) {
                    clear();
                    setConfirmClear(false);
                  } else {
                    setConfirmClear(true);
                  }
                }}
              >
                {confirmClear ? "Confirm — erase all" : "Clear queue"}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table" data-testid="queue-table">
              <thead>
                <tr>
                  <th><span className="sr-only">Resolved</span></th>
                  <th>Priority</th>
                  <th>Intent</th>
                  <th>Sentiment</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Summary</th>
                  <th>Received</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="faint" style={{ textAlign: "center", padding: 28 }}>
                      No tickets match these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => (
                    <tr key={e.id} className={e.resolved ? "is-resolved" : ""}>
                      <td className="num">
                        <input
                          type="checkbox"
                          className="check"
                          checked={e.resolved}
                          onChange={() => toggle(e.id)}
                          aria-label={`Mark "${e.ticket.summary.slice(0, 40)}" ${e.resolved ? "open" : "resolved"}`}
                        />
                      </td>
                      <td><PriorityTag value={e.ticket.priority} /></td>
                      <td><IntentTag value={e.ticket.intent} /></td>
                      <td><SentimentTag value={e.ticket.sentiment} /></td>
                      <td className="mono-num">{e.ticket.orderId ?? <span className="faint">—</span>}</td>
                      <td className="mono-num">{formatPaise(e.ticket.amountPaise)}</td>
                      <td className="clip">
                        {e.ticket.summary}
                        {e.redacted.length ? <div className="faint" style={{ fontSize: 11 }}>redacted: {e.redacted.join(", ")}</div> : null}
                      </td>
                      <td className="faint mono-num" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                        {formatTime(e.at)}
                        <div>{e.source}{e.cached ? " · cache" : ""}</div>
                      </td>
                      <td className="num">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(e.id)} aria-label="Remove ticket">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
