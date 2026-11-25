import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, api } from "../api/client";
import { LIMITS, type TriageResponse } from "../api/types";
import { ErrorPanel } from "../components/ErrorPanel";
import { Scramble } from "../components/Glitch";
import { PageHead } from "../components/Layout";
import { TicketSlip } from "../components/TicketSlip";
import { SAMPLES } from "../lib/samples";
import { useQueue } from "../state/queue";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: TriageResponse; seq: number }
  | { status: "error"; error: ApiError; seq: number };

export function TriagePage() {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const seqRef = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const { add } = useQueue();

  useEffect(() => () => inFlight.current?.abort(), []);

  const trimmed = message.trim();
  const tooLong = message.length > LIMITS.messageMax;
  const canSubmit = trimmed.length > 0 && !tooLong && state.status !== "loading";

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: "loading" });

    try {
      const result = await api.triage(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      seqRef.current += 1;
      setState({ status: "done", result, seq: seqRef.current });
      add([result], "single");
    } catch (err) {
      if (controller.signal.aborted) return;
      seqRef.current += 1;
      setState({
        status: "error",
        error: err instanceof ApiError ? err : new ApiError("unknown", String(err)),
        seq: seqRef.current,
      });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <>
      <PageHead kicker="01 / single message" title="Triage">
        Paste a raw customer message. It is screened for prompt injection, stripped of personal data, then turned into a typed
        ticket.
      </PageHead>

      <div className="grid-2">
        <form className="stack" onSubmit={submit} aria-label="Triage a message">
          <div>
            <label className="field-label" htmlFor="message">
              <span>Incoming message</span>
              <span className={`counter ${tooLong ? "counter--over" : ""}`} data-testid="char-count">
                {message.length.toLocaleString()} / {LIMITS.messageMax.toLocaleString()}
              </span>
            </label>
            <textarea
              id="message"
              className="textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. I was charged twice for order A-4471, ₹1299 each time…"
              aria-invalid={tooLong}
              aria-describedby={tooLong ? "message-error" : undefined}
              spellCheck={false}
              autoFocus
            />
            {tooLong ? (
              <p id="message-error" className="counter--over" style={{ margin: "8px 0 0", fontSize: 12 }}>
                Too long by {(message.length - LIMITS.messageMax).toLocaleString()} characters.
              </p>
            ) : null}
          </div>

          <div className="row row--between">
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                {state.status === "loading" ? "Decoding…" : "Run triage"} <kbd>⌃↵</kbd>
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setMessage("");
                  setState({ status: "idle" });
                }}
                disabled={message.length === 0 && state.status === "idle"}
              >
                Clear
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Load a test signal
            </div>
            <div className="row" style={{ gap: 6 }}>
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={`chip ${s.label === "injection" ? "chip--warn" : ""}`}
                  onClick={() => setMessage(s.message)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </form>

        <section aria-label="Result" aria-live="polite">
          {state.status === "idle" ? (
            <div className="void">
              <div>
                <div className="void__big">NO SIGNAL</div>
                <p style={{ margin: "10px 0 0" }}>Awaiting transmission. The extracted ticket appears here.</p>
              </div>
            </div>
          ) : null}
          {state.status === "loading" ? (
            <div className="panel">
              <div className="progress" />
              <div className="panel__body" style={{ minHeight: 300 }}>
                <Scramble label="Extracting fields…" />
              </div>
            </div>
          ) : null}
          {state.status === "done" ? <TicketSlip key={state.seq} result={state.result} seq={state.seq} /> : null}
          {state.status === "error" ? <ErrorPanel key={state.seq} error={state.error} /> : null}
        </section>
      </div>
    </>
  );
}
