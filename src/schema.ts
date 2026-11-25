import { z } from "zod";

/**
 * One schema, three jobs: it constrains the model's output, it validates that
 * output at runtime, and it generates the TypeScript type. There is no second
 * place where the shape of a ticket is written down.
 */
export const TicketSchema = z.object({
  intent: z
    .enum(["refund", "bug", "billing", "delivery", "account", "question", "other"])
    .describe("What the customer actually wants"),
  priority: z
    .enum(["low", "medium", "high"])
    .describe("high only for payment failures, outages, or data loss"),
  sentiment: z.enum(["angry", "neutral", "happy"]),
  orderId: z.string().nullable().describe("Order ID if one is mentioned, else null"),
  amountPaise: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("Any money amount mentioned, in paise. 1 rupee = 100 paise"),
  summary: z.string().min(1).max(200).describe("One sentence, neutral tone"),
});

export type Ticket = z.infer<typeof TicketSchema>;

export const TriageRequest = z.object({
  message: z.string().min(1).max(5000),
});

export const BatchRequest = z.object({
  messages: z.array(z.string().min(1).max(5000)).min(1).max(50),
});
