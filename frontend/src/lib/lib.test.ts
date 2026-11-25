import { describe, expect, it } from "vitest";
import { batchToCsv, parseCsv, parseLines, validateBatch } from "./batch";
import { formatCostPaise, formatPaise, formatPercent } from "./format";

describe("format", () => {
  it("formats paise as rupees", () => {
    expect(formatPaise(129900)).toBe("₹1,299");
    expect(formatPaise(1250)).toBe("₹12.50");
    expect(formatPaise(0)).toBe("₹0");
    expect(formatPaise(null)).toBe("—");
    expect(formatPaise(10000000)).toBe("₹1,00,000"); // Indian digit grouping
  });

  it("formats fractional model cost without rounding to zero", () => {
    expect(formatCostPaise(0.286)).toBe("₹0.0029");
    expect(formatCostPaise(0)).toBe("₹0");
  });

  it("formats ratios", () => {
    expect(formatPercent(0.5)).toBe("50.0%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("batch parsing", () => {
  it("splits lines and drops blanks", () => {
    expect(parseLines("a\n\n  b  \r\nc\n")).toEqual(["a", "b", "c"]);
  });

  it("reads a message column from CSV with quotes, commas and newlines", () => {
    const csv = 'id,message\n1,"Refund, please"\n2,"He said ""hi"""\n3,"two\nlines"\n4,\n';
    expect(parseCsv(csv)).toEqual(["Refund, please", 'He said "hi"', "two\nlines"]);
  });

  it("uses the first column when no header names the message", () => {
    expect(parseCsv("first one,x\nsecond one,y")).toEqual(["first one", "second one"]);
  });

  it("validates count and length like the backend", () => {
    expect(validateBatch([])).toHaveLength(1);
    expect(validateBatch(Array(50).fill("x"))).toHaveLength(0);
    expect(validateBatch(Array(51).fill("x"))[0]!.reason).toMatch(/at most 50/);
    expect(validateBatch(["ok", "y".repeat(5001)])[0]!.line).toBe(2);
  });

  it("exports results to CSV with escaping", () => {
    const csv = batchToCsv(
      ['a "quoted", msg', "bad"],
      [
        {
          index: 0,
          ok: true,
          ticket: { intent: "refund", priority: "low", sentiment: "neutral", orderId: null, amountPaise: null, summary: "x, y" },
          meta: { cached: false, attempts: 1, redacted: [], usage: { inputTokens: 1, outputTokens: 1, costPaise: 0 } },
        },
        { index: 1, ok: false, error: "blocked" },
      ],
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("index,status,intent,priority,sentiment,orderId,amountPaise,summary,error,message");
    expect(lines[1]).toBe('1,ok,refund,low,neutral,,,"x, y",,"a ""quoted"", msg"');
    expect(lines[2]).toBe("2,failed,,,,,,,blocked,bad");
  });
});
