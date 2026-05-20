import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import { prisma } from "../db/prisma.js";
import { buildWorkflowState } from "../langgraph/services/workflow-state.js";
import type { WorkflowState } from "../langgraph/state.js";
import { streamMainWorkflowResponse } from "../langgraph/workflow.js";
import { generateSessionTitle } from "../langgraph/session-title.js";
import { canUserAccessSession } from "../services/access.js";

const chatStreamSchema = z.object({
  thread_id: z.string().min(1),
  message: z.string().trim().min(1),
});

const defaultSessionTitle = "New session";

function writeSseEvent(
  writable: NodeJS.WritableStream,
  event: string,
  data: Record<string, unknown>,
): void {
  writable.write(`event: ${event}\n`);
  writable.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/chat/stream", async (request, reply) => {
    const payload = chatStreamSchema.parse(request.body);
    const canAccess = await canUserAccessSession(request.currentUser, payload.thread_id);
    if (!canAccess) {
      reply.code(403);
      return { detail: "Session access denied." };
    }

    const session = await prisma.agentSession.findFirst({
      where: {
        threadId: payload.thread_id,
        companyId: request.currentUser.company_id,
      },
    });
    if (!session) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    const now = new Date();
    await prisma.agentMessage.create({
      data: {
        threadId: payload.thread_id,
        companyId: session.companyId,
        role: "user",
        content: payload.message,
        createdAt: now,
      },
    });

    const nextTitle =
      session.title === defaultSessionTitle
        ? await generateSessionTitle(payload.message)
        : session.title || defaultSessionTitle;

    await prisma.agentSession.update({
      where: { threadId: payload.thread_id },
      data: {
        title: nextTitle,
        updatedAt: now,
      },
    });

    let workflowState: WorkflowState;
    try {
      workflowState = await buildWorkflowState({
        user: request.currentUser,
        threadId: payload.thread_id,
        message: payload.message,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to prepare workflow.";
      reply.code(detail === "Session not found." ? 404 : 403);
      return { detail };
    }

    reply.hijack();
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...(origin
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            Vary: "Origin",
          }
        : {}),
    });

    const assistantParts: string[] = [];

    try {
      const workflow = await streamMainWorkflowResponse(workflowState);

      for await (const chunk of workflow.stream) {
        const text = workflow.extractText(chunk.content);
        if (!text) {
          continue;
        }

        assistantParts.push(text);
        writeSseEvent(reply.raw, "token", { text });
      }

      const assistantText = assistantParts.join("").trim();
      const completedAt = new Date();

      await prisma.agentMessage.create({
        data: {
          threadId: payload.thread_id,
          companyId: session.companyId,
          role: "assistant",
          content: assistantText,
          createdAt: completedAt,
        },
      });

      await prisma.agentSession.update({
        where: { threadId: payload.thread_id },
        data: { updatedAt: completedAt },
      });

      writeSseEvent(reply.raw, "done", {
        thread_id: payload.thread_id,
        message: assistantText,
        title: nextTitle,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Streaming failed.";
      request.log.error(
        {
          err: error,
          thread_id: payload.thread_id,
          agent_id: session.agentId,
          gemini_model: settings.geminiModel,
        },
        "Chat stream failed.",
      );
      writeSseEvent(reply.raw, "error", { detail });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}
