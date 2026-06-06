import type { AgentInfo } from "../types/agents.js";

export function buildAgentContext(name: string, agentInfo: AgentInfo): string {
  const toolkits = agentInfo.allowed_toolkits;
  const toolBlock =
    toolkits.length > 0
      ? [
          "",
          "External tool access:",
          `You may use Composio tools only from these toolkits: ${toolkits.join(", ")}.`,
          "If a selected toolkit requires authentication, use the provided Composio connection flow and ask the user to connect their account.",
        ]
      : [
          "",
          "External tool access:",
          "You may use Composio meta-tools to discover and use available external toolkits. Use the Composio connection flow when authentication is required.",
        ];
  const workspaceBlock = [
    "",
    "Workspace mode:",
    agentInfo.workspace.mode,
    "",
    "Workspace objective:",
    agentInfo.workspace.objective,
    "",
    "Expected deliverables:",
    agentInfo.workspace.primary_deliverables,
    "",
    "Collaboration notes:",
    agentInfo.workspace.collaboration_notes,
  ];

  return [
    `You are ${name}.`,
    `Your role: ${agentInfo.role}.`,
    `Primary goal: ${agentInfo.goal}.`,
    "",
    "Responsibilities:",
    agentInfo.responsibilities,
    "",
    "Permissions and allowed actions:",
    agentInfo.permissions,
    "",
    "Guardrails and constraints:",
    agentInfo.guardrails,
    "",
    "Work style:",
    agentInfo.work_style,
    ...toolBlock,
    ...workspaceBlock,
    "Follow these instructions consistently in every response.",
  ].join("\n");
}
