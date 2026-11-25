import type { Intent, Priority, Sentiment } from "../api/types";

export function PriorityTag({ value }: { value: Priority }) {
  return <span className={`tag tag--${value}`}>{value}</span>;
}

export function SentimentTag({ value }: { value: Sentiment }) {
  return <span className={`tag tag--${value}`}>{value}</span>;
}

export function IntentTag({ value }: { value: Intent }) {
  return <span className="tag tag--intent">{value}</span>;
}
