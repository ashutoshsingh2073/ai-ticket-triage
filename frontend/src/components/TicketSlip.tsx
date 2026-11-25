import type { TriageResponse } from "../api/types";
import { formatCostPaise, formatPaise } from "../lib/format";
import { IntentTag, PriorityTag, SentimentTag } from "./Tags";

/** The extracted ticket, printed like a slip off a broken teleprinter. */
export function TicketSlip({ result, seq }: { result: TriageResponse; seq: number }) {
  const { ticket, meta } = result;
  return (
    <article className="panel panel--marked glitch-in" aria-label="Triaged ticket">
      <div className="panel__head">
        <span>
          Ticket <strong className="mono-num">#{String(seq).padStart(4, "0")}</strong>
        </span>
        <span>{meta.cached ? <span className="tag tag--ok">cache hit</span> : <span className="tag tag--muted">live</span>}</span>
      </div>
      <div className={`stamp stamp--${ticket.priority}`} aria-hidden="true">
        {ticket.priority.toUpperCase()}
      </div>
      <div className="panel__body">
        <p className="slip__summary" data-testid="ticket-summary">
          {ticket.summary}
        </p>
        <dl className="kv">
          <dt>Intent</dt>
          <dd data-testid="ticket-intent">
            <IntentTag value={ticket.intent} />
          </dd>
          <dt>Priority</dt>
          <dd data-testid="ticket-priority">
            <PriorityTag value={ticket.priority} />
          </dd>
          <dt>Sentiment</dt>
          <dd data-testid="ticket-sentiment">
            <SentimentTag value={ticket.sentiment} />
          </dd>
          <dt>Order ID</dt>
          <dd className="big" data-testid="ticket-order">
            {ticket.orderId ?? <span className="faint">none</span>}
          </dd>
          <dt>Amount</dt>
          <dd className="big" data-testid="ticket-amount">
            {ticket.amountPaise === null ? <span className="faint">none</span> : formatPaise(ticket.amountPaise)}
          </dd>
          <dt>PII redacted</dt>
          <dd data-testid="ticket-redacted">
            {meta.redacted.length === 0 ? (
              <span className="faint">nothing found</span>
            ) : (
              <span className="row" style={{ gap: 6 }}>
                {meta.redacted.map((r) => (
                  <span key={r} className="tag tag--low">
                    {r}
                  </span>
                ))}
              </span>
            )}
          </dd>
        </dl>
      </div>
      <div className="meta-strip">
        <div>
          <span>Attempts</span>
          <b>{meta.attempts}</b>
        </div>
        <div>
          <span>Tokens in</span>
          <b>{meta.usage.inputTokens}</b>
        </div>
        <div>
          <span>Tokens out</span>
          <b>{meta.usage.outputTokens}</b>
        </div>
        <div>
          <span>Cost</span>
          <b data-testid="ticket-cost">{formatCostPaise(meta.usage.costPaise)}</b>
        </div>
      </div>
    </article>
  );
}
