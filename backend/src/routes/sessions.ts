import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { settings } from "../config.js";
import {
  defaultAdminAgentId,
  defaultAdminUserId,
  defaultCompanyId,
} from "../constants/seed.js";
import { query } from "../db/postgres.js";
import { canUserAccessAgent, canUserAccessSession } from "../services/access.js";
import { getAgentById } from "../services/agents.js";
import type { MessageRecord, SessionRecord } from "../types/chat.js";

const uuidLikeSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/);

const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    agent_id: uuidLikeSchema.optional(),
    user_prompt: z.string().trim().min(1).optional(),
  })
  .optional();

const threadIdSchema = z.object({
  thread_id: z.string().min(1),
});

const updateSessionSchema = z.object({
  title: z.string().trim().min(1),
});

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/sessions", async (request) => {
    const sessions = request.currentUser.is_admin
      ? await query<SessionRecord>(
          `SELECT thread_id, title, created_at, updated_at, agent_id, user_prompt, system_prompt_used
           FROM "${settings.appSchema}".agent_sessions
           WHERE company_id = $1
           ORDER BY updated_at DESC`,
          [request.currentUser.company_id],
        )
      : await query<SessionRecord>(
          `SELECT thread_id, title, created_at, updated_at, agent_id, user_prompt, system_prompt_used
           FROM "${settings.appSchema}".agent_sessions
           WHERE company_id = $1
             AND created_by_user_id = $2
           ORDER BY updated_at DESC`,
          [request.currentUser.company_id, request.currentUser.id],
        );

    return sessions satisfies SessionRecord[];
  });

  app.post("/api/sessions", async (request, reply) => {
    const payload = createSessionSchema.parse(request.body);
    const agentId = payload?.agent_id ?? defaultAdminAgentId;
    const agent = await getAgentById(agentId);
    if (!agent) {
      reply.code(404);
      return { detail: "Agent not found." };
    }
    const canAccess = await canUserAccessAgent(request.currentUser, agentId);
    if (!canAccess) {
      reply.code(403);
      return { detail: "Agent access denied." };
    }

    const now = new Date();
    const session: SessionRecord = {
      thread_id: randomUUID(),
      title: payload?.title?.trim() || "New session",
      created_at: now,
      updated_at: now,
      agent_id: agent.id,
      user_prompt: payload?.user_prompt?.trim() || null,
      system_prompt_used: agent.system_prompt,
    };

    await query(
      `INSERT INTO "${settings.appSchema}".agent_sessions
       (thread_id, company_id, created_by_user_id, title, agent_id, user_prompt, system_prompt_used, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        session.thread_id,
        request.currentUser.company_id ?? defaultCompanyId,
        request.currentUser.id ?? defaultAdminUserId,
        session.title,
        session.agent_id,
        session.user_prompt,
        session.system_prompt_used,
        session.created_at,
        session.updated_at,
      ],
    );

    reply.code(201);
    return session;
  });

  app.get("/api/sessions/:thread_id/messages", async (request, reply) => {
    const { thread_id } = threadIdSchema.parse(request.params);
    const canAccess = await canUserAccessSession(request.currentUser, thread_id);
    if (!canAccess) {
      reply.code(403);
      return { detail: "Session access denied." };
    }

    const [session] = await query<{ thread_id: string }>(
      `SELECT thread_id
       FROM "${settings.appSchema}".agent_sessions
       WHERE thread_id = $1 AND company_id = $2`,
      [thread_id, request.currentUser.company_id],
    );
    if (!session) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    const messages = await query<MessageRecord>(
      `SELECT role, content, created_at
       FROM "${settings.appSchema}".agent_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [thread_id],
    );

    return messages satisfies MessageRecord[];
  });

  app.patch("/api/sessions/:thread_id", async (request, reply) => {
    const { thread_id } = threadIdSchema.parse(request.params);
    const payload = updateSessionSchema.parse(request.body);
    const canAccess = await canUserAccessSession(request.currentUser, thread_id);
    if (!canAccess) {
      reply.code(403);
      return { detail: "Session access denied." };
    }

    const [updatedSession] = await query<SessionRecord>(
      `UPDATE "${settings.appSchema}".agent_sessions
       SET title = $3, updated_at = $4
       WHERE thread_id = $1 AND company_id = $2
       RETURNING thread_id, title, created_at, updated_at, agent_id, user_prompt, system_prompt_used`,
      [thread_id, request.currentUser.company_id, payload.title.trim(), new Date()],
    );

    if (!updatedSession) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    return updatedSession satisfies SessionRecord;
  });

  app.delete("/api/sessions/:thread_id", async (request, reply) => {
    const { thread_id } = threadIdSchema.parse(request.params);
    if (!request.currentUser.is_admin) {
      reply.code(403);
      return { detail: "Admin access required." };
    }

    const [deletedSession] = await query<{ thread_id: string }>(
      `DELETE FROM "${settings.appSchema}".agent_sessions
       WHERE thread_id = $1 AND company_id = $2
       RETURNING thread_id`,
      [thread_id, request.currentUser.company_id],
    );

    if (!deletedSession) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    return { success: true, thread_id };
  });
}
