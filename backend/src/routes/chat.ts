import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { settings } from "../config.js";
import { query } from "../db/postgres.js";
import { createUserInput, extractText, getAgentGraph } from "../langgraph/admin-agent.js";
import { canUserAccessSession } from "../services/access.js";
import { getAgentById } from "../services/agents.js";

const chatStreamSchema = z.object({
  thread_id: z.string().min(1),
  message: z.string().trim().min(1),
});

const appSchema = `"${settings.appSchema.replaceAll('"', '""')}"`;
const sessionTable = `${appSchema}.agent_sessions`;
const messageTable = `${appSchema}.agent_messages`;

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

    const [session] = await query<{
      title: string;
      agent_id: string;
      company_id: string;
      user_prompt: string | null;
      system_prompt_used: string;
    }>(
      `SELECT title, agent_id, company_id, user_prompt, system_prompt_used
       FROM ${sessionTable} WHERE thread_id = $1 AND company_id = $2`,
      [payload.thread_id, request.currentUser.company_id],
    );
    if (!session) {
      reply.code(404);
      return { detail: "Session not found." };
    }

    const now = new Date();
    await query(
      `INSERT INTO ${messageTable} (thread_id, company_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [payload.thread_id, session.company_id, "user", payload.message, now],
    );

    await query(
      `UPDATE ${sessionTable}
       SET title = $2, updated_at = $3
       WHERE thread_id = $1`,
      [payload.thread_id, session.title || "New session", now],
    );

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    const assistantParts: string[] = [];

    try {
      const agent = await getAgentById(session.agent_id);
      if (!agent) {
        throw new Error("Session agent no longer exists.");
      }

      const runtimePrompt = [session.system_prompt_used];
      if (session.user_prompt?.trim()) {
        runtimePrompt.push("", "User style preferences:", session.user_prompt.trim());
      }

      const agentGraph = await getAgentGraph(agent);
      const stream = await agentGraph.stream(
        createUserInput(payload.message, runtimePrompt.join("\n")),
        {
        configurable: { thread_id: payload.thread_id },
        streamMode: "messages",
        },
      );

      for await (const [chunk, metadata] of stream) {
        if (metadata.langgraph_node !== "agent_executor") {
          continue;
        }

        const text = extractText(chunk.content);
        if (!text) {
          continue;
        }

        assistantParts.push(text);
        writeSseEvent(reply.raw, "token", { text });
      }

      const assistantText = assistantParts.join("").trim();
      const completedAt = new Date();

      await query(
        `INSERT INTO ${messageTable} (thread_id, company_id, role, content, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [payload.thread_id, session.company_id, "assistant", assistantText, completedAt],
      );

      await query(
        `UPDATE ${sessionTable}
         SET updated_at = $2
         WHERE thread_id = $1`,
        [payload.thread_id, completedAt],
      );

      writeSseEvent(reply.raw, "done", {
        thread_id: payload.thread_id,
        message: assistantText,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Streaming failed.";
      writeSseEvent(reply.raw, "error", { detail });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}
