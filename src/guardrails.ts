/**
 * Cheap checks that run before and after the model. None of them is perfect —
 * the point is that the model is never the only thing standing between user
 * input and the rest of the system.
 */

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are now\b/i,
  /reveal (your )?(system )?prompt/i,
  /print (your )?(instructions|system prompt)/i,
  /\bdeveloper mode\b/i,
  /<\s*\/?\s*(system|instructions)\s*>/i,
];

export function detectInjection(text: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;
const PHONE_IN = /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g;
const CARD = /\b(?:\d[ -]*?){13,16}\b/g;

/**
 * Redact before sending to the provider, so personal data never leaves the
 * system in a prompt, and again on the way out, in case the model echoes it.
 */
export function redactPII(text: string): { text: string; redacted: string[] } {
  const redacted: string[] = [];
  const out = text
    .replace(CARD, () => (redacted.push("card"), "[CARD]"))
    .replace(EMAIL, () => (redacted.push("email"), "[EMAIL]"))
    .replace(PHONE_IN, () => (redacted.push("phone"), "[PHONE]"));
  return { text: out, redacted: [...new Set(redacted)] };
}
