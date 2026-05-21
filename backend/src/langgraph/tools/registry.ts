import type { StructuredToolInterface } from "@langchain/core/tools";

import { settings } from "../../config.js";
import type { WorkflowState } from "../state.js";
import {
  createGmailCreateDraftTool,
  createGmailReadMessageTool,
  createGmailSearchMessagesTool,
  createGmailSendDraftTool,
} from "./gmail.js";
import { webSearchTool } from "./web-search.js";

export type ToolId =
  | "web_search"
  | "gmail_create_draft"
  | "gmail_send_draft"
  | "gmail_search_messages"
  | "gmail_read_message";
export type ToolCategory = "research" | "company_data" | "ticketing" | "email" | "admin";
export type ToolRisk = "low" | "medium" | "high";
export type ToolRuntimeContext = Pick<WorkflowState, "user" | "session" | "agent" | "runtime">;

export type ToolDefinition = {
  id: ToolId;
  label: string;
  category: ToolCategory;
  risk: ToolRisk;
  requiresConfig: boolean;
  promptDescription: string;
  createTool: (context: ToolRuntimeContext) => StructuredToolInterface;
};

export type ToolCatalogEntry = Pick<
  ToolDefinition,
  "id" | "label" | "category" | "risk" | "promptDescription"
> & {
  requiresConfig: boolean;
  configured: boolean;
};

const toolRegistry = [
  {
    id: "web_search",
    label: "Web search",
    category: "research",
    risk: "low",
    requiresConfig: true,
    promptDescription: "Search public web results for current external information.",
    createTool: () => webSearchTool,
  },
  {
    id: "gmail_create_draft",
    label: "Gmail create draft",
    category: "email",
    risk: "medium",
    requiresConfig: true,
    promptDescription: "Create Gmail drafts for the current user's connected Google account.",
    createTool: createGmailCreateDraftTool,
  },
  {
    id: "gmail_send_draft",
    label: "Gmail send draft",
    category: "email",
    risk: "high",
    requiresConfig: true,
    promptDescription: "Send an existing Gmail draft by draft ID for the current user's connected Google account.",
    createTool: createGmailSendDraftTool,
  },
  {
    id: "gmail_search_messages",
    label: "Gmail search messages",
    category: "email",
    risk: "medium",
    requiresConfig: true,
    promptDescription: "Search Gmail messages for the current user's connected Google account.",
    createTool: createGmailSearchMessagesTool,
  },
  {
    id: "gmail_read_message",
    label: "Gmail read message",
    category: "email",
    risk: "medium",
    requiresConfig: true,
    promptDescription: "Read Gmail message metadata and snippets for the current user's connected Google account.",
    createTool: createGmailReadMessageTool,
  },
] satisfies ToolDefinition[];

function isToolConfigured(definition: ToolDefinition): boolean {
  if (definition.id === "web_search") {
    return Boolean(settings.tavilyApiKey);
  }

  if (definition.category === "email") {
    return Boolean(
      settings.googleOAuth.clientId &&
        settings.googleOAuth.clientSecret &&
        settings.tokenEncryptionKey,
    );
  }

  return true;
}

export function getToolCatalog(): ToolCatalogEntry[] {
  return toolRegistry.map(
    (definition) => {
      const { id, label, category, risk, requiresConfig, promptDescription } = definition;
      return {
        id,
        label,
        category,
        risk,
        requiresConfig,
        configured: isToolConfigured(definition),
        promptDescription,
      };
    },
  );
}

export function getConfiguredToolCatalog(): ToolDefinition[] {
  return toolRegistry.filter(isToolConfigured);
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

export function resolveToolsForAgent(
  toolIds: string[],
  context: ToolRuntimeContext,
): StructuredToolInterface[] {
  const allowedIds = new Set(toolIds);

  return getConfiguredToolCatalog()
    .filter((definition) => allowedIds.has(definition.id))
    .map((definition) => definition.createTool(context));
}

export function hasConfiguredTool(toolIds: string[], toolId: ToolId): boolean {
  return getConfiguredToolIds().includes(toolId) && toolIds.includes(toolId);
}
