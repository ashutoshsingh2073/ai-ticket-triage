import { LIMITS, type BatchItem } from "../api/types";

/** One message per non-blank line. */
export function parseLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Minimal RFC-4180 CSV reader: quoted fields, escaped quotes, commas and
 * newlines inside quotes. Uses a "message" column if a header names one,
 * otherwise the first column.
 */
export function parseCsv(raw: string): string[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (quoted) {
      if (c === '"' && raw[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((f) => f.trim().length > 0));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0]!.map((h) => h.trim().toLowerCase());
  const named = header.findIndex((h) => h === "message" || h === "text" || h === "body");
  const col = named >= 0 ? named : 0;
  const data = named >= 0 ? nonEmpty.slice(1) : nonEmpty;

  return data.map((r) => (r[col] ?? "").trim()).filter((m) => m.length > 0);
}

export type BatchProblem = { line: number; reason: string };

/** Mirror the backend's BatchRequest schema so the user sees problems before sending. */
export function validateBatch(messages: string[]): BatchProblem[] {
  const problems: BatchProblem[] = [];
  if (messages.length === 0) problems.push({ line: 0, reason: "Add at least one message." });
  if (messages.length > LIMITS.batchMax)
    problems.push({ line: 0, reason: `${messages.length} messages — the API accepts at most ${LIMITS.batchMax} per batch.` });
  messages.forEach((m, i) => {
    if (m.length > LIMITS.messageMax)
      problems.push({ line: i + 1, reason: `Message ${i + 1} is ${m.length} characters (max ${LIMITS.messageMax}).` });
  });
  return problems;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function batchToCsv(messages: string[], results: BatchItem[]): string {
  const head = ["index", "status", "intent", "priority", "sentiment", "orderId", "amountPaise", "summary", "error", "message"];
  const lines = results.map((r) => {
    const msg = messages[r.index] ?? "";
    return r.ok
      ? [r.index + 1, "ok", r.ticket.intent, r.ticket.priority, r.ticket.sentiment, r.ticket.orderId, r.ticket.amountPaise, r.ticket.summary, "", msg]
      : [r.index + 1, "failed", "", "", "", "", "", "", r.error, msg];
  });
  return [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
