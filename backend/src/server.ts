import Fastify from "fastify";
import cors from "@fastify/cors";

import { settings } from "./config.js";
import { connectToPostgres } from "./db/postgres.js";
import { devAuthPlugin } from "./plugins/dev-auth.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerSessionRoutes } from "./routes/sessions.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: settings.allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});
await devAuthPlugin(app);

app.get("/health", async () => ({ status: "ok" }));

await registerAuthRoutes(app);
await registerSessionRoutes(app);
await registerAgentRoutes(app);
await registerChatRoutes(app);

async function start(): Promise<void> {
  await connectToPostgres();
  await app.listen({
    host: "0.0.0.0",
    port: settings.port,
  });
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
