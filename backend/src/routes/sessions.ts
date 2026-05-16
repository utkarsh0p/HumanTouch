import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  defaultAdminAgentId,
  defaultAdminUserId,
  defaultCompanyId,
} from "../constants/seed.js";
import { prisma } from "../db/prisma.js";
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

function toSessionRecord(session: {
  threadId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  agentId: string;
  userPrompt: string | null;
  systemPromptUsed: string;
}): SessionRecord {
  return {
    thread_id: session.threadId,
    title: session.title,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    agent_id: session.agentId,
    user_prompt: session.userPrompt,
    system_prompt_used: session.systemPromptUsed,
  };
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/sessions", async (request) => {
    const sessions = await prisma.agentSession.findMany({
      where: {
        companyId: request.currentUser.company_id,
        ...(request.currentUser.is_admin ? {} : { createdByUserId: request.currentUser.id }),
      },
      orderBy: { updatedAt: "desc" },
    });

    return sessions.map(toSessionRecord) satisfies SessionRecord[];
  });

  app.post("/api/sessions", async (request, reply) => {
    const payload = createSessionSchema.parse(request.body);
    const agentId = payload?.agent_id ?? defaultAdminAgentId;
    const agent = await getAgentById(agentId);
    if (!agent) {
      reply.code(404);
      return { detail: "Agent not found." };
    }
    if (agent.archived_at) {
      reply.code(409);
      return { detail: "Archived agents cannot be used for new sessions." };
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

    await prisma.agentSession.create({
      data: {
        threadId: session.thread_id,
        companyId: request.currentUser.company_id ?? defaultCompanyId,
        createdByUserId: request.currentUser.id ?? defaultAdminUserId,
        title: session.title,
        agentId: session.agent_id,
        userPrompt: session.user_prompt,
        systemPromptUsed: session.system_prompt_used,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      },
    });

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

    const session = await prisma.agentSession.findFirst({
      where: {
        threadId: thread_id,
        companyId: request.currentUser.company_id,
      },
      select: { threadId: true },
    });
    if (!session) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    const messages = await prisma.agentMessage.findMany({
      where: { threadId: thread_id },
      orderBy: { createdAt: "asc" },
    });

    return messages.map((message) => ({
      thread_id: message.threadId,
      role: message.role as MessageRecord["role"],
      content: message.content,
      created_at: message.createdAt,
    })) satisfies MessageRecord[];
  });

  app.patch("/api/sessions/:thread_id", async (request, reply) => {
    const { thread_id } = threadIdSchema.parse(request.params);
    const payload = updateSessionSchema.parse(request.body);
    const canAccess = await canUserAccessSession(request.currentUser, thread_id);
    if (!canAccess) {
      reply.code(403);
      return { detail: "Session access denied." };
    }

    const updateResult = await prisma.agentSession.updateMany({
      where: {
        threadId: thread_id,
        companyId: request.currentUser.company_id,
      },
      data: {
        title: payload.title.trim(),
        updatedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    const updatedSession = await prisma.agentSession.findUniqueOrThrow({
      where: { threadId: thread_id },
    });

    return toSessionRecord(updatedSession) satisfies SessionRecord;
  });

  app.delete("/api/sessions/:thread_id", async (request, reply) => {
    const { thread_id } = threadIdSchema.parse(request.params);
    if (!request.currentUser.is_admin) {
      reply.code(403);
      return { detail: "Admin access required." };
    }

    const deletedSession = await prisma.agentSession.deleteMany({
      where: {
        threadId: thread_id,
        companyId: request.currentUser.company_id,
      },
    });

    if (deletedSession.count === 0) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    return { success: true, thread_id };
  });
}
