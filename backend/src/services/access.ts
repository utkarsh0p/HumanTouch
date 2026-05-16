import { prisma } from "../db/prisma.js";
import type { AuthenticatedUser } from "../types/auth.js";

import { toAgentRecord } from "./agents.js";

export function ensureAdmin(user: AuthenticatedUser): void {
  if (!user.is_admin) {
    throw new Error("Admin access required.");
  }
}

export async function canUserAccessAgent(
  user: AuthenticatedUser,
  agentId: string,
): Promise<boolean> {
  if (user.is_admin) {
    const agent = await prisma.agent.findFirst({
      where: {
        id: agentId,
        companyId: user.company_id,
      },
      select: { id: true },
    });
    return Boolean(agent);
  }

  const direct = await prisma.agent.findFirst({
    where: {
      id: agentId,
      companyId: user.company_id,
      OR: [
        {
          userAssignments: {
            some: { userId: user.id },
          },
        },
        {
          roleAssignments: {
            some: { roleKey: user.role_key },
          },
        },
      ],
    },
    select: { id: true },
  });

  return Boolean(direct);
}

export async function getAccessibleAgents(user: AuthenticatedUser) {
  if (user.is_admin) {
    const agents = await prisma.agent.findMany({
      where: {
        companyId: user.company_id,
        archivedAt: null,
      },
      include: {
        roleAssignments: true,
        userAssignments: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    });

    return agents.map(toAgentRecord);
  }

  const agents = await prisma.agent.findMany({
    where: {
      companyId: user.company_id,
      archivedAt: null,
      OR: [
        {
          userAssignments: {
            some: { userId: user.id },
          },
        },
        {
          roleAssignments: {
            some: { roleKey: user.role_key },
          },
        },
      ],
    },
    include: {
      roleAssignments: true,
      userAssignments: {
        include: {
          user: true,
        },
      },
    },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  });

  return agents.map(toAgentRecord);
}

export async function canUserAccessSession(
  user: AuthenticatedUser,
  threadId: string,
): Promise<boolean> {
  if (user.is_admin) {
    const session = await prisma.agentSession.findFirst({
      where: {
        threadId,
        companyId: user.company_id,
      },
      select: { threadId: true },
    });
    return Boolean(session);
  }

  const session = await prisma.agentSession.findFirst({
    where: {
      threadId,
      companyId: user.company_id,
      createdByUserId: user.id,
    },
    select: { threadId: true },
  });
  return Boolean(session);
}
