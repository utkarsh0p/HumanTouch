import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ensureAdmin, getAccessibleAgents } from "../services/access.js";
import { createAgent } from "../services/agents.js";

const createAgentSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  responsibilities: z.string().trim().min(1),
  permissions: z.string().trim().min(1),
  guardrails: z.string().trim().min(1),
  work_style: z.string().trim().min(1),
  assigned_roles: z.array(z.string().trim().min(1)).default([]),
  assigned_user_ids: z.array(z.string().uuid()).default([]),
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
