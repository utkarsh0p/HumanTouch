import type { AgentInfo } from "../types/agents.js";

export function buildAgentContext(name: string, agentInfo: AgentInfo): string {
  const toolkitList = agentInfo.allowed_toolkits ?? [];
  const toolkitSummary =
    toolkitList.length > 0
      ? `Available external toolkits: ${toolkitList.join(", ")}.`
      : "All connected external toolkits are available.";
  const toolBlock = [
    "",
    "External tool access:",
    toolkitSummary,
    "If a toolkit requires authentication, use the Composio connection tool to generate an OAuth link for the user.",
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
