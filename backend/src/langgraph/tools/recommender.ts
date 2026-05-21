import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";
import { z } from "zod";

import { settings } from "../../config.js";
import type { AgentInfo } from "../../types/agents.js";
import {
  getConfiguredToolCatalog,
  getPromptSafeToolCatalog,
  recommendDefaultToolIds,
  validateConfiguredToolIds,
  type ToolId,
} from "./registry.js";

const llm = new ChatGoogle({
  apiKey: settings.googleApiKey,
  model: settings.geminiModel,
  temperature: 0,
  maxRetries: 2,
});

const recommendationSchema = z.object({
  recommended_tool_ids: z.array(z.string()).default([]),
  reason: z.string().default(""),
});

const recommenderInstructions = [
  "You assign tools to business AI agents.",
  "Given the agent definition and available tool catalog, return only the tool IDs the agent needs to perform its allowed work.",
  "Grant the minimum necessary tools.",
  'Do not grant tools merely because the restrictions say "all tools", "no restriction", or similar broad permission.',
  "Never invent tool IDs.",
  "Prefer no tools when the agent can complete the work without external capabilities.",
  'Return only valid JSON with this shape: {"recommended_tool_ids":[],"reason":""}.',
].join(" ");

export type ToolRecommendationInput = {
  name: string;
  agentInfo: Pick<AgentInfo, "goal" | "responsibilities" | "guardrails">;
};

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("Tool recommendation response did not contain JSON.");
    }

    return JSON.parse(objectMatch[0]);
  }
}

function fallbackToolIds(input: ToolRecommendationInput): ToolId[] {
  return recommendDefaultToolIds(input.agentInfo);
}

function validateAutoRecommendedToolIds(toolIds: string[]): ToolId[] {
  const configuredTools = new Map(getConfiguredToolCatalog().map((definition) => [definition.id, definition]));
  const validatedToolIds = validateConfiguredToolIds(toolIds);

  return validatedToolIds.filter((toolId) => configuredTools.get(toolId)?.risk === "low");
}

export async function recommendToolIdsForAgent(
  input: ToolRecommendationInput,
): Promise<ToolId[]> {
  const toolCatalog = getPromptSafeToolCatalog();

  if (toolCatalog.length === 0) {
    return [];
  }

  try {
    const response = await llm.invoke([
      new SystemMessage(recommenderInstructions),
      new HumanMessage(
        JSON.stringify(
          {
            agent: {
              name: input.name,
              purpose: input.agentInfo.goal,
              allowed_tasks: input.agentInfo.responsibilities,
              restrictions: input.agentInfo.guardrails,
            },
            available_tools: toolCatalog,
          },
          null,
          2,
        ),
      ),
    ]);

    const parsed = recommendationSchema.parse(parseJsonObject(extractText(response.content)));
    return validateAutoRecommendedToolIds(parsed.recommended_tool_ids);
  } catch {
    return fallbackToolIds(input);
  }
}
