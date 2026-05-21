import type { StructuredToolInterface } from "@langchain/core/tools";

import { settings } from "../../config.js";
import type { AgentInfo } from "../../types/agents.js";
import { webSearchTool } from "./web-search.js";

export type ToolId = "web_search";
export type ToolCategory = "research" | "company_data" | "ticketing" | "email" | "admin";
export type ToolRisk = "low" | "medium" | "high";

export type ToolDefinition = {
  id: ToolId;
  label: string;
  category: ToolCategory;
  risk: ToolRisk;
  requiresConfig: boolean;
  promptDescription: string;
  tool: StructuredToolInterface;
};

export type ToolCatalogEntry = Pick<
  ToolDefinition,
  "id" | "label" | "category" | "risk" | "promptDescription"
>;

const toolRegistry = [
  {
    id: "web_search",
    label: "Web search",
    category: "research",
    risk: "low",
    requiresConfig: true,
    promptDescription: "Search public web results for current external information.",
    tool: webSearchTool,
  },
] satisfies ToolDefinition[];

export function getConfiguredToolCatalog(): ToolDefinition[] {
  return toolRegistry.filter((definition) => {
    if (definition.id === "web_search") {
      return Boolean(settings.tavilyApiKey);
    }

    return !definition.requiresConfig;
  });
}

export function getPromptSafeToolCatalog(): ToolCatalogEntry[] {
  return getConfiguredToolCatalog().map(
    ({ id, label, category, risk, promptDescription }) => ({
      id,
      label,
      category,
      risk,
      promptDescription,
    }),
  );
}

export function getConfiguredToolIds(): ToolId[] {
  return getConfiguredToolCatalog().map((definition) => definition.id);
}

export function validateConfiguredToolIds(toolIds: string[]): ToolId[] {
  const configuredIds = new Set(getConfiguredToolIds());
  const unknownIds = toolIds.filter((toolId) => !configuredIds.has(toolId as ToolId));

  if (unknownIds.length > 0) {
    throw new Error(`Tool not available: ${unknownIds.join(", ")}`);
  }

  return [...new Set(toolIds)] as ToolId[];
}

export function resolveToolsForAgent(toolIds: string[]): StructuredToolInterface[] {
  const allowedIds = new Set(toolIds);

  return getConfiguredToolCatalog()
    .filter((definition) => allowedIds.has(definition.id))
    .map((definition) => definition.tool);
}

export function hasConfiguredTool(toolIds: string[], toolId: ToolId): boolean {
  return getConfiguredToolIds().includes(toolId) && toolIds.includes(toolId);
}

export function recommendDefaultToolIds(
  agentInfo: Pick<AgentInfo, "goal" | "responsibilities" | "guardrails">,
): ToolId[] {
  if (!settings.tavilyApiKey) {
    return [];
  }

  const restrictionText = agentInfo.guardrails.toLowerCase();
  const blocksWebAccess = [
    "no internet",
    "no external research",
    "no web",
    "do not search",
    "don't search",
    "without internet",
    "avoid internet",
    "avoid web",
  ].some((phrase) => restrictionText.includes(phrase));

  if (blocksWebAccess) {
    return [];
  }

  const workText = `${agentInfo.goal}\n${agentInfo.responsibilities}`.toLowerCase();
  const needsResearch = [
    "research",
    "web",
    "internet",
    "latest",
    "current",
    "recent",
    "news",
    "market",
    "competitor",
    "external",
    "source",
    "sources",
    "documentation",
  ].some((phrase) => workText.includes(phrase));

  return needsResearch ? ["web_search"] : [];
}
