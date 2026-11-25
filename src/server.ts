import { config } from "./config.js";
import { createApp } from "./app.js";

const server = createApp().listen(config.PORT, () => {
  console.log(`Listening on http://localhost:${config.PORT} (provider: ${config.LLM_PROVIDER})`);
});

const shutdown = () => {
  console.log("Shutting down…");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
