import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ensureAdmin, getAccessibleAgents } from "../services/access.js";
import { createAgent } from "../services/agents.js";

const createAgentSchema = z.object({
  name: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  allowed_tasks: z.string().trim().min(1),
  restrictions: z.string().trim().min(1),
  assigned_role_keys: z.array(z.string().trim().min(1)).default([]),
  assigned_user_emails: z.array(z.string().trim().email()).default([]),
});

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/agents", async (request) => {
    return await getAccessibleAgents(request.currentUser);
  });

  app.post("/api/agents", async (request, reply) => {
    ensureAdmin(request.currentUser);
    const payload = createAgentSchema.parse(request.body);
    const agent = await createAgent(payload, request.currentUser);
    reply.code(201);
    return agent;
  });
}
