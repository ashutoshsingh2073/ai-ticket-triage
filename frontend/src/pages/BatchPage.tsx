import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { ApiError, api } from "../api/client";
import { LIMITS, type BatchItemOk, type BatchResponse } from "../api/types";
import { ErrorPanel } from "../components/ErrorPanel";
import { Scramble } from "../components/Glitch";
import { PageHead } from "../components/Layout";
import { IntentTag, PriorityTag, SentimentTag } from "../components/Tags";
import { batchToCsv, downloadText, parseCsv, parseLines, validateBatch } from "../lib/batch";
import { formatCostPaise, formatPaise, pad } from "../lib/format";
import { SAMPLES } from "../lib/samples";
import { useQueue } from "../state/queue";

type Filter = "all" | "failed" | "high";

type Run = { messages: string[]; response: BatchResponse; seq: number };

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function BatchPage() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<{ error: ApiError; seq: number } | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const { add } = useQueue();

  useEffect(() => () => inFlight.current?.abort(), []);

  const messages = useMemo(() => parseLines(raw), [raw]);
  const problems = useMemo(() => (raw.trim() ? validateBatch(messages) : []), [raw, messages]);
  const canSubmit = messages.length > 0 && problems.length === 0 && !loading;

  async function submit() {
    if (!canSubmit) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const snapshot = messages;
    setLoading(true);
    setError(null);

    try {
      const response = await api.triageBatch(snapshot, controller.signal);
      if (controller.signal.aborted) return;
      seq.current += 1;
      setRun({ messages: snapshot, response, seq: seq.current });
      setFilter("all");
      add(
        response.results.filter((r): r is BatchItemOk => r.ok),
        "batch",
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      seq.current += 1;
      setError({ error: err instanceof ApiError ? err : new ApiError("unknown", String(err)), seq: seq.current });
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }

  async function loadFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setFileNote(`${file.name} is larger than 2 MB — not loaded.`);
      return;
    }
    const text = await file.text();
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const parsed = isCsv ? parseCsv(text) : parseLines(text);
    // Messages can't contain newlines in the editor, so flatten any from CSV cells.
    setRaw(parsed.map((m) => m.replace(/\s*\r?\n\s*/g, " ")).join("\n"));
    setFileNote(`Loaded ${parsed.length} message${parsed.length === 1 ? "" : "s"} from ${file.name}`);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const stats = useMemo(() => {
    if (!run) return null;
    const ok = run.response.results.filter((r): r is BatchItemOk => r.ok);
    return {
      total: run.response.total,
      succeeded: run.response.succeeded,
      failed: run.response.total - run.response.succeeded,
      high: ok.filter((r) => r.ticket.priority === "high").length,
      cached: ok.filter((r) => r.meta.cached).length,
      cost: ok.reduce((s, r) => s + r.meta.usage.costPaise, 0),
    };
  }, [run]);

  const rows = useMemo(() => {
    if (!run) return [];
    return run.response.results.filter((r) =>
      filter === "all" ? true : filter === "failed" ? !r.ok : r.ok && r.ticket.priority === "high",
    );
  }, [run, filter]);

  return (
    <>
      <PageHead kicker="02 / bulk intake" title="Batch">
        Up to {LIMITS.batchMax} messages, one per line, processed with bounded concurrency. A bad message fails on its own — the rest
        still come back.
      </PageHead>

      <div className="stack">
        <div
          className={`drop ${dragOver ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <label className="field-label" htmlFor="batch">
            <span>Messages — one per line, or drop a .txt / .csv</span>
            <span className={`counter ${messages.length > LIMITS.batchMax ? "counter--over" : ""}`} data-testid="batch-count">
              {messages.length} / {LIMITS.batchMax}
            </span>
          </label>
          <textarea
            id="batch"
            className="textarea"
            style={{ minHeight: 220 }}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={"The app crashes on the cart page\nI want a refund for order B-500\nWhere is my parcel for order D-9100?"}
            aria-invalid={problems.length > 0}
            spellCheck={false}
          />
        </div>

        {problems.length > 0 ? (
          <div className="alert alert--inline" role="alert">
            <ul>
              {problems.slice(0, 5).map((p) => (
                <li key={`${p.line}-${p.reason}`}>{p.reason}</li>
              ))}
              {problems.length > 5 ? <li>…and {problems.length - 5} more.</li> : null}
            </ul>
          </div>
        ) : null}

        <div className="row row--between">
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={!canSubmit}>
              {loading ? "Processing…" : `Run batch (${messages.length})`} <kbd>⌃↵</kbd>
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => fileInput.current?.click()}>
              Load file
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setRaw(SAMPLES.map((s) => s.message).join("\n"))}>
              Load samples
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setRaw("");
                setFileNote(null);
              }}
              disabled={!raw}
            >
              Clear
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={onFile}
              hidden
              data-testid="batch-file"
            />
          </div>
          {fileNote ? <span className="faint" style={{ fontSize: 12 }}>{fileNote}</span> : null}
        </div>

        {loading ? (
          <div className="panel">
            <div className="progress" />
            <div className="panel__body">
              <Scramble label={`Processing ${messages.length} messages…`} length={40} />
            </div>
          </div>
        ) : null}

        {error && !loading ? <ErrorPanel key={error.seq} error={error.error} /> : null}

        {run && stats && !loading ? (
          <section className="stack glitch-in" key={run.seq} aria-label="Batch results">
            <div className="stats">
              <div className="stat">
                <div className="stat__label">Total</div>
                <div className="stat__value" data-testid="batch-total">{stats.total}</div>
              </div>
              <div className="stat stat--acid">
                <div className="stat__label">Succeeded</div>
                <div className="stat__value" data-testid="batch-succeeded">{stats.succeeded}</div>
              </div>
              <div className={`stat ${stats.failed ? "stat--red" : ""}`}>
                <div className="stat__label">Failed</div>
                <div className="stat__value" data-testid="batch-failed">{stats.failed}</div>
              </div>
              <div className={`stat ${stats.high ? "stat--red" : ""}`}>
                <div className="stat__label">High priority</div>
                <div className="stat__value">{stats.high}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Spend</div>
                <div className="stat__value" style={{ fontSize: 36 }}>{formatCostPaise(stats.cost)}</div>
                <div className="stat__note">{stats.cached} served from cache</div>
              </div>
            </div>

            <div className="row row--between">
              <div className="segmented" role="group" aria-label="Filter results">
                {(["all", "failed", "high"] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === "high" ? "high priority" : f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => downloadText(`triage-batch-${Date.now()}.csv`, batchToCsv(run.messages, run.response.results))}
              >
                Export CSV
              </button>
            </div>

            <div className="table-wrap">
              <table className="table" data-testid="batch-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Intent</th>
                    <th>Priority</th>
                    <th>Sentiment</th>
                    <th>Order</th>
                    <th>Amount</th>
                    <th>Summary / error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="faint" style={{ textAlign: "center", padding: 28 }}>
                        Nothing matches this filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) =>
                      r.ok ? (
                        <tr key={r.index}>
                          <td className="num">{pad(r.index + 1)}</td>
                          <td>
                            <span className="tag tag--ok">{r.meta.cached ? "cached" : "ok"}</span>
                          </td>
                          <td><IntentTag value={r.ticket.intent} /></td>
                          <td><PriorityTag value={r.ticket.priority} /></td>
                          <td><SentimentTag value={r.ticket.sentiment} /></td>
                          <td className="mono-num">{r.ticket.orderId ?? <span className="faint">—</span>}</td>
                          <td className="mono-num">{formatPaise(r.ticket.amountPaise)}</td>
                          <td className="clip">{r.ticket.summary}</td>
                        </tr>
                      ) : (
                        <tr key={r.index} className="is-failed">
                          <td className="num">{pad(r.index + 1)}</td>
                          <td>
                            <span className="tag tag--fail">failed</span>
                          </td>
                          <td colSpan={5} className="faint clip">
                            {(run.messages[r.index] ?? "").slice(0, 90)}
                          </td>
                          <td className="clip" style={{ color: "var(--red)" }}>{r.error}</td>
                        </tr>
                      ),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
