import type { FastifyInstance } from "fastify";

import { ensureAdmin } from "../services/access.js";
import { getToolCatalog } from "../langgraph/tools/registry.js";

export async function registerToolRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/tools", async (request) => {
    ensureAdmin(request.currentUser);
    return getToolCatalog();
  });
}
