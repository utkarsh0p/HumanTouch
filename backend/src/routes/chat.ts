import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import { prisma } from "../db/prisma.js";
import {
  buildSelectedAgentRuntimeState,
  generateDirectAgentResponse,
  streamSelectedAgentResponse,
} from "../langgraph/agent-runtime.js";
import { generateSessionTitle } from "../langgraph/session-title.js";
import { canUserAccessSession } from "../services/access.js";

const chatStreamSchema = z.object({
  thread_id: z.string().min(1),
  message: z.string().trim().min(1),
});

const defaultSessionTitle = "New session";
const emptyAssistantFallback =
  "I could not complete that response because the agent tried to use an external tool but did not return a final answer. Please try again, or connect the required integration if this request needs external data.";

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

    let runtimeState;
    try {
      runtimeState = await buildSelectedAgentRuntimeState({
        user: request.currentUser,
        threadId: payload.thread_id,
        message: payload.message,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to prepare agent runtime.";
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
    let finalAssistantText = "";

    try {
      const stream = streamSelectedAgentResponse(runtimeState);

      for await (const event of stream) {
        if (event.type === "progress") {
          writeSseEvent(reply.raw, "progress", event.progress);
          continue;
        }

        if (event.type === "final") {
          finalAssistantText = event.text;
          continue;
        }

        if (!event.text) {
          continue;
        }

        assistantParts.push(event.text);
        writeSseEvent(reply.raw, "token", { text: event.text });
      }

      const streamedText = assistantParts.join("").trim();
      const resolvedFinalText = finalAssistantText.trim();
      let assistantText = resolvedFinalText || streamedText;
      if (!assistantText) {
        assistantText = (await generateDirectAgentResponse(runtimeState)) || emptyAssistantFallback;
      }

      // If the full final text differs from what was streamed, replace it in the UI
      if (assistantText && assistantText !== streamedText) {
        writeSseEvent(reply.raw, "final", { text: assistantText });
      } else if (!streamedText && assistantText) {
        writeSseEvent(reply.raw, "token", { text: assistantText });
      }

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
