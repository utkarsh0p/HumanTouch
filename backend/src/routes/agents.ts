import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ensureAdmin, getAccessibleAgents } from "../services/access.js";
import { archiveAgent, createAgent, updateAgent } from "../services/agents.js";

const createAgentSchema = z.object({
  name: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  allowed_tasks: z.string().trim().min(1),
  restrictions: z.string().trim().min(1),
  assigned_role_keys: z.array(z.string().trim().min(1)).default([]),
  assigned_user_emails: z.array(z.string().trim().email()).default([]),
});
const updateAgentSchema = createAgentSchema;
const agentParamsSchema = z.object({
  agentId: z.string().uuid(),
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

  app.patch("/api/agents/:agentId", async (request, reply) => {
    ensureAdmin(request.currentUser);
    const { agentId } = agentParamsSchema.parse(request.params);
    const payload = updateAgentSchema.parse(request.body);

    try {
      return await updateAgent(agentId, payload, request.currentUser);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to update agent.";
      reply.code(detail === "Agent not found." ? 404 : 400);
      return { detail };
    }
  });

  app.patch("/api/agents/:agentId/archive", async (request, reply) => {
    ensureAdmin(request.currentUser);
    const { agentId } = agentParamsSchema.parse(request.params);

    try {
      return await archiveAgent(agentId, request.currentUser);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to archive agent.";
      reply.code(detail === "Agent not found." ? 404 : 400);
      return { detail };
    }
  });
}
