import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../state/queue";
import { HEALTH, entry, jsonResponse, mockFetch, renderApp, triageResult } from "../test/utils";

afterEach(() => vi.unstubAllGlobals());

const METRICS = { requests: 7, llmCalls: 5, costPaise: 1.432, blocked: 2, failures: 1, cache: { size: 5, hits: 2, misses: 5, hitRate: 0.286 } };

describe("shell", () => {
  it("shows API online when /health answers", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/");
    await waitFor(() => expect(screen.getByTestId("api-status")).toHaveAttribute("data-state", "online"));
    expect(screen.getByTestId("api-status")).toHaveTextContent("mock");
  });

  it("shows API offline when the backend is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderApp("/");
    await waitFor(() => expect(screen.getByTestId("api-status")).toHaveAttribute("data-state", "offline"));
  });

  it("renders a 404 for unknown routes", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/nope");
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("/nope")).toBeInTheDocument();
  });

  it("navigates with Alt+number", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/");
    await userEvent.keyboard("{Alt>}3{/Alt}");
    expect(screen.getByRole("heading", { name: "Queue" })).toBeInTheDocument();
  });
});

describe("triage page", () => {
  it("disables submit for empty or whitespace input", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/");
    const btn = screen.getByRole("button", { name: /run triage/i });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/incoming message/i), "   ");
    expect(btn).toBeDisabled();
  });

  it("blocks messages over 5000 characters before sending", async () => {
    const fetch = mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/");
    const box = screen.getByLabelText(/incoming message/i);
    await userEvent.click(box);
    await userEvent.paste("x".repeat(5001));
    expect(screen.getByText(/too long by 1 characters/i)).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /run triage/i })).toBeDisabled();
    expect(fetch.mock.calls.every(([u]) => !String(u).includes("/triage"))).toBe(true);
  });

  it("renders the ticket and adds it to the queue", async () => {
    const fetch = mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage": () => jsonResponse(triageResult({}, { redacted: ["email"] })),
    });
    renderApp("/");
    await userEvent.type(screen.getByLabelText(/incoming message/i), "  zq-unique-raw-input contact me at a@b.co  ");
    await userEvent.click(screen.getByRole("button", { name: /run triage/i }));

    const slip = await screen.findByRole("article", { name: /triaged ticket/i });
    expect(within(slip).getByTestId("ticket-intent")).toHaveTextContent("billing");
    expect(within(slip).getByTestId("ticket-priority")).toHaveTextContent("high");
    expect(within(slip).getByTestId("ticket-order")).toHaveTextContent("A-4471");
    expect(within(slip).getByTestId("ticket-amount")).toHaveTextContent("₹1,299");
    expect(within(slip).getByTestId("ticket-redacted")).toHaveTextContent("email");

    // message is trimmed before sending
    const call = fetch.mock.calls.find(([u]) => String(u).endsWith("/triage"))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ message: "zq-unique-raw-input contact me at a@b.co" });

    // queue badge and storage are updated, without the raw message
    expect(screen.getByLabelText("1 open tickets")).toBeInTheDocument();
    const stored = localStorage.getItem(STORAGE_KEY)!;
    expect(JSON.parse(stored)).toHaveLength(1);
    expect(stored).not.toContain("zq-unique-raw-input");
    expect(stored).not.toContain("a@b.co");
  });

  it("submits with Ctrl+Enter", async () => {
    const fetch = mockFetch({ "GET /health": () => jsonResponse(HEALTH), "POST /triage": () => jsonResponse(triageResult()) });
    renderApp("/");
    await userEvent.type(screen.getByLabelText(/incoming message/i), "hi{Control>}{Enter}{/Control}");
    await screen.findByRole("article", { name: /triaged ticket/i });
    expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/triage"))).toHaveLength(1);
  });

  it("shows the injection-blocked state on 422 and does not queue it", async () => {
    mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage": () => jsonResponse({ error: "This message looks like a prompt-injection attempt and was not processed." }, 422),
    });
    renderApp("/");
    await userEvent.click(screen.getByRole("button", { name: "injection" }));
    await userEvent.click(screen.getByRole("button", { name: /run triage/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-error-kind", "blocked");
    expect(alert).toHaveTextContent(/injection blocked/i);
    expect(screen.getByLabelText("0 open tickets")).toBeInTheDocument();
  });

  it("shows retry timing on 429", async () => {
    mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage": () => jsonResponse({ error: "Too many requests" }, 429, { "Retry-After": "42" }),
    });
    renderApp("/");
    await userEvent.type(screen.getByLabelText(/incoming message/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /run triage/i }));
    expect(await screen.findByText("Retry in 42s.")).toBeInTheDocument();
  });

  it("shows the human-review fallback on 502", async () => {
    mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage": () => jsonResponse({ error: "Could not classify this message", fallback: "human_review" }, 502),
    });
    renderApp("/");
    await userEvent.type(screen.getByLabelText(/incoming message/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /run triage/i }));
    expect(await screen.findByText(/needs a human/i)).toBeInTheDocument();
    expect(screen.getByText("human_review")).toBeInTheDocument();
  });

  it("shows a loading state and prevents double submit", async () => {
    let resolve!: (r: Response) => void;
    const fetch = mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage": () => new Promise<Response>((r) => (resolve = r)),
    });
    renderApp("/");
    await userEvent.type(screen.getByLabelText(/incoming message/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /run triage/i }));
    expect(screen.getByRole("button", { name: /decoding/i })).toBeDisabled();
    expect(screen.getByText("Extracting fields…", { selector: ".sr-only" })).toBeInTheDocument();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/triage"))).toHaveLength(1);
    await act(async () => resolve(jsonResponse(triageResult())));
    await screen.findByRole("article", { name: /triaged ticket/i });
  });
});

describe("batch page", () => {
  it("counts messages and enforces the 50 limit", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/batch");
    const box = screen.getByLabelText(/messages — one per line/i);
    await userEvent.click(box);
    await userEvent.paste(Array.from({ length: 51 }, (_, i) => `msg ${i}`).join("\n"));
    expect(screen.getByTestId("batch-count")).toHaveTextContent("51 / 50");
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 50/);
    expect(screen.getByRole("button", { name: /run batch/i })).toBeDisabled();
  });

  it("renders per-item results, filters them, and queues only successes", async () => {
    const fetch = mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage/batch": () =>
        jsonResponse({
          total: 3,
          succeeded: 2,
          results: [
            { index: 0, ok: true, ...triageResult({ intent: "bug", priority: "medium", orderId: null, amountPaise: null, summary: "App crashes" }) },
            { index: 1, ok: true, ...triageResult({ intent: "refund", priority: "high", summary: "Refund B-500" }) },
            { index: 2, ok: false, error: "This message looks like a prompt-injection attempt and was not processed." },
          ],
        }),
    });
    renderApp("/batch");
    await userEvent.type(screen.getByLabelText(/messages — one per line/i), "one\n\ntwo\nthree");
    expect(screen.getByTestId("batch-count")).toHaveTextContent("3 / 50");
    await userEvent.click(screen.getByRole("button", { name: /run batch \(3\)/i }));

    await screen.findByTestId("batch-table");
    const call = fetch.mock.calls.find(([u]) => String(u).endsWith("/triage/batch"))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ messages: ["one", "two", "three"] });
    expect(screen.getByTestId("batch-total")).toHaveTextContent("3");
    expect(screen.getByTestId("batch-succeeded")).toHaveTextContent("2");
    expect(screen.getByTestId("batch-failed")).toHaveTextContent("1");

    const table = screen.getByTestId("batch-table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "failed" }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText(/prompt-injection/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "high priority" }));
    expect(within(table).getByText("Refund B-500")).toBeInTheDocument();

    expect(screen.getByLabelText("2 open tickets")).toBeInTheDocument();
  });

  it("loads messages from a CSV file", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/batch");
    const file = new File(['message\n"Refund, please"\nWhere is my parcel?\n'], "tickets.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByTestId("batch-file"), file);
    await waitFor(() => expect(screen.getByTestId("batch-count")).toHaveTextContent("2 / 50"));
    expect(screen.getByLabelText(/messages — one per line/i)).toHaveValue("Refund, please\nWhere is my parcel?");
    expect(screen.getByText(/loaded 2 messages from tickets.csv/i)).toBeInTheDocument();
  });

  it("shows a whole-batch error (e.g. 400) without crashing", async () => {
    mockFetch({
      "GET /health": () => jsonResponse(HEALTH),
      "POST /triage/batch": () => jsonResponse({ error: "Too big: expected array to have <=50 items" }, 400),
    });
    renderApp("/batch");
    await userEvent.type(screen.getByLabelText(/messages — one per line/i), "one");
    await userEvent.click(screen.getByRole("button", { name: /run batch/i }));
    expect(await screen.findByRole("alert")).toHaveAttribute("data-error-kind", "validation");
  });
});

describe("queue page", () => {
  const seed = [
    entry("e1", { priority: "low", intent: "question", summary: "How do I change my address", orderId: null }),
    entry("e2", { priority: "high", intent: "billing", summary: "Charged twice", orderId: "A-1" }),
    entry("e3", { priority: "medium", intent: "delivery", summary: "Parcel late", orderId: "D-9" }),
  ];

  it("shows an empty state with links when nothing is queued", () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/queue", []);
    expect(screen.getByText("QUEUE EMPTY")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /run a batch/i })).toHaveAttribute("href", "/batch");
  });

  it("sorts by priority and filters by search and select", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/queue", seed);
    const table = screen.getByTestId("queue-table");
    const summaries = () => within(table).getAllByRole("row").slice(1).map((r) => (r as HTMLTableRowElement).cells[6]!.textContent);
    expect(summaries()).toEqual(["Charged twice", "Parcel late", "How do I change my address"]);

    await userEvent.type(screen.getByLabelText("Search"), "d-9");
    expect(summaries()).toEqual(["Parcel late"]);
    await userEvent.clear(screen.getByLabelText("Search"));

    await userEvent.selectOptions(screen.getByLabelText("Priority"), "low");
    expect(summaries()).toEqual(["How do I change my address"]);
    await userEvent.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(screen.getByTestId("queue-showing")).toHaveTextContent("3 of 3");
  });

  it("resolves, removes and clears tickets (with confirmation)", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    renderApp("/queue", seed);
    expect(screen.getByTestId("queue-open")).toHaveTextContent("3");

    await userEvent.click(screen.getByRole("checkbox", { name: /charged twice/i }));
    expect(screen.getByTestId("queue-open")).toHaveTextContent("2");
    expect(screen.getByTestId("queue-showing")).toHaveTextContent("2 of 3"); // open filter hides it
    await userEvent.click(screen.getByRole("button", { name: "resolved" }));
    expect(screen.getByTestId("queue-showing")).toHaveTextContent("1 of 3");

    await userEvent.click(screen.getByRole("button", { name: "all" }));
    await userEvent.click(screen.getAllByRole("button", { name: /remove ticket/i })[0]!);
    expect(screen.getByTestId("queue-showing")).toHaveTextContent("2 of 2");

    await userEvent.click(screen.getByRole("button", { name: /clear queue/i }));
    expect(screen.getByTestId("queue-showing")).toHaveTextContent("2 of 2"); // first click only arms
    await userEvent.click(screen.getByRole("button", { name: /confirm — erase all/i }));
    expect(screen.getByText("QUEUE EMPTY")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
  });

  it("restores the queue from localStorage and ignores corrupt data", () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([seed[1], { junk: true }, null]));
    renderApp("/queue");
    expect(screen.getByTestId("queue-showing")).toHaveTextContent("1 of 1");
  });

  it("survives unparseable localStorage", () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH) });
    localStorage.setItem(STORAGE_KEY, "{not json");
    renderApp("/queue");
    expect(screen.getByText("QUEUE EMPTY")).toBeInTheDocument();
  });
});

describe("system page", () => {
  it("renders live metrics and health", async () => {
    mockFetch({ "GET /health": () => jsonResponse(HEALTH), "GET /metrics": () => jsonResponse(METRICS) });
    renderApp("/system", [entry("e1", { priority: "high" })]);
    expect(await screen.findByTestId("m-requests")).toHaveTextContent("7");
    expect(screen.getByTestId("m-llm")).toHaveTextContent("5");
    expect(screen.getByTestId("m-blocked")).toHaveTextContent("2");
    expect(screen.getByTestId("m-failures")).toHaveTextContent("1");
    expect(screen.getByTestId("m-cost")).toHaveTextContent("₹0.0143");
    expect(screen.getByTestId("m-hitrate")).toHaveTextContent("28.6%");
    expect(screen.getByRole("meter", { name: /cache hit rate/i })).toHaveAttribute("aria-valuenow", "29");
    await waitFor(() => expect(screen.getByTestId("health-provider")).toHaveTextContent("mock"));
  });

  it("shows an offline error when metrics cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderApp("/system");
    expect(await screen.findByRole("alert")).toHaveAttribute("data-error-kind", "network");
  });
});
