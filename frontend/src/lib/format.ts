const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** 129900 → "₹1,299". Paise are integers, so no float drift in the source value. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? inr.format(rupees).replace(/\.00$/, "") : inr.format(rupees);
}

/** Model spend is fractions of a paisa, so show it with enough precision to be non-zero. */
export function formatCostPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  if (paise === 0) return "₹0";
  return `₹${(paise / 100).toFixed(4)}`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}
