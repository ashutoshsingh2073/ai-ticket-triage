/**
 * Field-level evaluation with a confusion matrix.
 *
 * Classification quality is not one number: a model can be 90% accurate overall
 * and still miss every high-priority ticket, which is the only failure that
 * actually costs money. This prints per-field accuracy and shows which labels
 * get confused with which.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { extractor } from "../src/extractor.js";
import type { Ticket } from "../src/schema.js";

type Example = {
  id: string;
  message: string;
  expected: Partial<Pick<Ticket, "intent" | "priority" | "sentiment" | "orderId" | "amountPaise">>;
};

const here = dirname(fileURLToPath(import.meta.url));
const FIELDS = ["intent", "priority", "sentiment", "orderId", "amountPaise"] as const;

function printMatrix(title: string, pairs: { expected: string; actual: string }[]) {
  const labels = [...new Set(pairs.flatMap((p) => [p.expected, p.actual]))].sort();
  if (labels.length === 0) return;
  const width = Math.max(10, ...labels.map((l) => l.length + 1));
  const pad = (s: string) => s.padEnd(width);

  console.log(`\n${title} (rows = expected, columns = predicted)`);
  console.log(pad("") + labels.map(pad).join(""));
  for (const row of labels) {
    const cells = labels.map((col) =>
      pad(String(pairs.filter((p) => p.expected === row && p.actual === col).length)),
    );
    console.log(pad(row) + cells.join(""));
  }
}

async function main() {
  const examples: Example[] = JSON.parse(await readFile(join(here, "dataset.json"), "utf8"));

  const correct: Record<string, number> = {};
  const counted: Record<string, number> = {};
  const intentPairs: { expected: string; actual: string }[] = [];
  const priorityPairs: { expected: string; actual: string }[] = [];
  const failures: string[] = [];
  let costPaise = 0;

  for (const ex of examples) {
    const { ticket, usage } = await extractor.extract(ex.message);
    costPaise += usage.costPaise;

    for (const field of FIELDS) {
      const expected = ex.expected[field];
      if (expected === undefined) continue;
      counted[field] = (counted[field] ?? 0) + 1;
      const actual = ticket[field];
      if (actual === expected) {
        correct[field] = (correct[field] ?? 0) + 1;
      } else {
        failures.push(`${ex.id}.${field}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      }
    }

    if (ex.expected.intent) intentPairs.push({ expected: ex.expected.intent, actual: ticket.intent });
    if (ex.expected.priority) priorityPairs.push({ expected: ex.expected.priority, actual: ticket.priority });
  }

  console.log("\nTriage evaluation");
  console.log("-----------------");
  console.log(`Examples: ${examples.length}`);
  for (const field of FIELDS) {
    if (!counted[field]) continue;
    const pct = ((correct[field] ?? 0) / counted[field]) * 100;
    console.log(`  ${field.padEnd(13)} ${pct.toFixed(0).padStart(3)}%  (${correct[field] ?? 0}/${counted[field]})`);
  }
  console.log(`Estimated cost: ₹${(costPaise / 100).toFixed(4)} for ${examples.length} messages`);

  printMatrix("Intent", intentPairs);
  printMatrix("Priority", priorityPairs);

  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }

  // The gate that matters: never under-call a high-priority ticket.
  const missedHigh = priorityPairs.filter((p) => p.expected === "high" && p.actual !== "high").length;
  const intentAccuracy = (correct.intent ?? 0) / (counted.intent || 1);

  console.log(`\nMissed high-priority tickets: ${missedHigh}`);
  if (missedHigh > 0 || intentAccuracy < 0.8) {
    console.error("Quality gate failed.");
    process.exit(1);
  }
  console.log("Quality gates passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
