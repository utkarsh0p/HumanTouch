import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";

import { settings } from "../config.js";
import type { AgentInfo } from "../types/agents.js";
import { buildAgentContext } from "../services/agent-context.js";

const llm = new ChatGoogle({
  apiKey: settings.googleApiKey,
  model: settings.geminiModel,
  temperature: 0.1,
  maxRetries: 2,
});

const compilerInstructions = [
  "You are a prompt compiler for business AI agents.",
  "Create a production-ready system prompt from the provided agent definition.",
  "Return only the final system prompt text.",
  "Do not add markdown fences, labels, or commentary.",
  "Keep the prompt concise, operational, and enforce the provided constraints clearly.",
].join(" ");

export async function compileAgentSystemPrompt(
  name: string,
  agentInfo: AgentInfo,
): Promise<string> {
  const fallback = buildAgentContext(name, agentInfo);

  try {
    const response = await llm.invoke([
      new SystemMessage(compilerInstructions),
      new HumanMessage(
        JSON.stringify(
          {
            name,
            role: agentInfo.role,
            goal: agentInfo.goal,
            responsibilities: agentInfo.responsibilities,
            permissions: agentInfo.permissions,
            guardrails: agentInfo.guardrails,
            work_style: agentInfo.work_style,
          },
          null,
          2,
        ),
      ),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content.trim()
        : response.content
            .map((part) =>
              typeof part === "string"
                ? part
                : "text" in part && typeof part.text === "string"
                  ? part.text
                  : "",
            )
            .join("")
            .trim();

    return content || fallback;
  } catch {
    return fallback;
  }
}
