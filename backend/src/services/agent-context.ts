import type { AgentInfo } from "../types/agents.js";

export function buildAgentContext(name: string, agentInfo: AgentInfo): string {
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
    "",
    "Follow these instructions consistently in every response.",
  ].join("\n");
}
