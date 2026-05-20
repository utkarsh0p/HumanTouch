import { prisma } from "../../db/prisma.js";
import { canUserAccessAgent } from "../../services/access.js";
import { getAgentById } from "../../services/agents.js";
import type { AuthenticatedUser } from "../../types/auth.js";
import type { WorkflowMessage, WorkflowState } from "../state.js";
import { parseWorkflowState } from "../state.js";

type BuildWorkflowStateParams = {
  user: AuthenticatedUser;
  threadId: string;
  message: string;
};

export async function buildWorkflowState({
  user,
  threadId,
  message,
}: BuildWorkflowStateParams): Promise<WorkflowState> {
  const session = await prisma.agentSession.findFirst({
    where: {
      threadId,
      companyId: user.company_id,
    },
  });
  if (!session) {
    throw new Error("Session not found.");
  }

  const canAccessAgent = await canUserAccessAgent(user, session.agentId);
  if (!canAccessAgent) {
    throw new Error("Agent access denied.");
  }

  const agent = await getAgentById(session.agentId);
  if (!agent || agent.company_id !== user.company_id) {
    throw new Error("Session agent no longer exists.");
  }

  const messages = await prisma.agentMessage.findMany({
    where: {
      threadId,
      role: { in: ["user", "assistant"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
  });

  return parseWorkflowState({
    user: {
      id: user.id,
      companyId: user.company_id,
      roleKey: user.role_key,
      isAdmin: user.is_admin,
    },
    session: {
      threadId: session.threadId,
      agentId: session.agentId,
      userPrompt: session.userPrompt,
      systemPromptUsed: session.systemPromptUsed,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      agentInfo: agent.agent_info,
      systemPrompt: agent.system_prompt,
      isSystem: agent.is_system,
    },
    input: { message },
    history: messages.map((item) => ({
      role: item.role as WorkflowMessage["role"],
      content: item.content,
    })),
    runtime: {
      mode: user.is_admin ? "admin" : "employee",
      adminOverride: user.is_admin,
    },
  });
}
