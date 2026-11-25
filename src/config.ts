import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),

  LLM_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  MODEL: z.string().default("gpt-4o-mini"),

  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(10 * 60_000),

  BATCH_CONCURRENCY: z.coerce.number().int().positive().max(20).default(5),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),

  // Rough cost model so the service can report spend per request.
  COST_PER_1K_INPUT_PAISE: z.coerce.number().default(1.3),
  COST_PER_1K_OUTPUT_PAISE: z.coerce.number().default(5.2),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;

if (config.LLM_PROVIDER === "openai" && !config.OPENAI_API_KEY) {
  console.error("LLM_PROVIDER=openai requires OPENAI_API_KEY");
  process.exit(1);
}
