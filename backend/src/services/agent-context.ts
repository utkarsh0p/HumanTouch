import type { AgentInfo } from "../types/agents.js";

export function buildAgentContext(name: string, agentInfo: AgentInfo): string {
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
    ...workspaceBlock,
    "Follow these instructions consistently in every response.",
  ].join("\n");
}
