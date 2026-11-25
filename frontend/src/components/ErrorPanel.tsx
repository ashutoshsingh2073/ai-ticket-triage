import { ApiError } from "../api/client";

const COPY: Record<ApiError["kind"], { title: string; hint: string; warn?: boolean }> = {
  validation: { title: "Rejected input", hint: "The API refused the request shape. Check the message length and try again." },
  blocked: {
    title: "Injection blocked",
    hint: "The guardrail matched a prompt-injection pattern, so the message never reached the model. Rephrase it as a normal support request.",
  },
  rate_limited: { title: "Rate limited", hint: "Too many requests from this client in the last minute.", warn: true },
  extraction_failed: {
    title: "Needs a human",
    hint: "The model could not produce a valid ticket after retrying. Route this one to manual review.",
    warn: true,
  },
  server: { title: "Server fault", hint: "The API hit an internal error. Check the backend logs." },
  network: { title: "Signal lost", hint: "No connection to the API. Start it with `npm run dev` in the project root (port 3100)." },
  timeout: { title: "Timed out", hint: "The API took too long to answer. The model provider may be slow." },
  unknown: { title: "Unexpected response", hint: "The API answered with something this client did not expect." },
};

export function ErrorPanel({ error }: { error: ApiError }) {
  const copy = COPY[error.kind];
  return (
    <div className={`alert shake ${copy.warn ? "alert--warn" : ""}`} role="alert" data-error-kind={error.kind}>
      <h2 className="alert__title">
        {copy.title}
        {error.status ? <span className="faint"> · {error.status}</span> : null}
      </h2>
      <p>{error.message}</p>
      <p>{copy.hint}</p>
      {error.retryAfterSec ? <p>Retry in {error.retryAfterSec}s.</p> : null}
      {error.fallback ? (
        <p>
          Fallback route: <code>{error.fallback}</code>
        </p>
      ) : null}
    </div>
  );
}
