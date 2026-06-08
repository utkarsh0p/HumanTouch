import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { defaultAdminUserId, defaultCompanyId } from "../constants/seed.js";
import { prisma } from "../db/prisma.js";
import { compileAgentSystemPrompt } from "../langgraph/agent-prompt-compiler.js";
import { getUsersByEmails } from "./users.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type {
  AgentCreatePayload,
  AgentInfo,
  AgentRecord,
  AgentUpdatePayload,
} from "../types/agents.js";

const agentInclude = {
  roleAssignments: true,
  userAssignments: {
    include: {
      user: true,
    },
  },
} satisfies Prisma.AgentInclude;

type AgentWithAssignments = Prisma.AgentGetPayload<{
  include: typeof agentInclude;
}>;

const supportedToolkits = new Set(["gmail", "github", "tavily"]);

export function toAgentRecord(agent: AgentWithAssignments): AgentRecord {
  const assignedRoles = [
    ...new Set(agent.roleAssignments.map((assignment) => assignment.roleKey)),
  ];
  const assignedUserIds = [
    ...new Set(agent.userAssignments.map((assignment) => assignment.userId)),
  ];
  const assignedUserEmails = [
    ...new Set(agent.userAssignments.map((assignment) => assignment.user.email)),
  ];

  const agentInfo = normalizeStoredAgentInfo(agent.agentInfo, agent.name);

  return {
    id: agent.id,
    company_id: agent.companyId,
    created_by_user_id: agent.createdByUserId,
    updated_by_user_id: agent.updatedByUserId,
    name: agent.name,
    slug: agent.slug,
    agent_info: agentInfo,
    system_prompt: agent.systemPrompt,
    prompt_version: agent.promptVersion,
    system_prompt_generated_at: agent.systemPromptGeneratedAt,
    is_system: agent.isSystem,
    archived_at: agent.archivedAt,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
    assigned_roles: assignedRoles,
    assigned_user_ids: assignedUserIds,
    assigned_user_emails: assignedUserEmails,
  };
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeToolkitList(values: string[]): string[] {
  return normalizeStringList(values.map((value) => value.toLowerCase()))
    .filter((toolkit) => supportedToolkits.has(toolkit))
    .sort();
}

function normalizeEmailList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function fallbackWorkspaceObjective(name: string): string {
  return `Own the ${name} workspace and help users complete its assigned work clearly and safely.`;
}

function deriveRoleFromName(name: string): string {
  return `${name} assistant`;
}

function normalizeOptionalText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeStoredAgentInfo(value: Prisma.JsonValue, name: string): AgentInfo {
  const stored = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const workspace =
    "workspace" in stored && stored.workspace && typeof stored.workspace === "object" && !Array.isArray(stored.workspace)
      ? stored.workspace
      : {};
  const baseInfo = {
    role: normalizeOptionalText(stored.role, deriveRoleFromName(name)),
    goal: normalizeOptionalText(stored.goal, fallbackWorkspaceObjective(name)),
    responsibilities: normalizeOptionalText(
      stored.responsibilities,
      "Carry out the assigned operational responsibilities.",
    ),
    permissions: normalizeOptionalText(
      stored.permissions,
      "Only act within the permissions explicitly given to you.",
    ),
    guardrails: normalizeOptionalText(
      stored.guardrails,
      "Do not exceed your scope, and surface uncertainty clearly.",
    ),
    work_style: normalizeOptionalText(stored.work_style, "Be clear, concise, and practical."),
  };
  const storedToolkits =
    "allowed_toolkits" in stored && Array.isArray(stored.allowed_toolkits)
      ? normalizeToolkitList(
          stored.allowed_toolkits.filter(
            (toolkit): toolkit is string => typeof toolkit === "string",
          ),
        )
      : normalizeToolkitList([]);

  return {
    ...baseInfo,
    allowed_toolkits: storedToolkits,
    allowed_tool_ids: [],
    workspace: {
      mode: "mode" in workspace && workspace.mode === "agentic" ? "agentic" : "chat",
      objective: normalizeOptionalText(
        "objective" in workspace ? workspace.objective : undefined,
        fallbackWorkspaceObjective(name),
      ),
      primary_deliverables: normalizeOptionalText(
        "primary_deliverables" in workspace ? workspace.primary_deliverables : undefined,
        "Produce clear, usable outputs inside the assigned workspace.",
      ),
      collaboration_notes: normalizeOptionalText(
        "collaboration_notes" in workspace ? workspace.collaboration_notes : undefined,
        "Support the assigned employee directly, keep context explicit, and surface blockers early.",
      ),
    },
  };
}

async function buildUniqueSlug(name: string, excludeAgentId?: string): Promise<string> {
  const baseSlug = slugify(name) || "agent";
  const matches = await prisma.agent.findMany({
    where: {
      OR: [{ slug: baseSlug }, { slug: { startsWith: `${baseSlug}-` } }],
      ...(excludeAgentId ? { id: { not: excludeAgentId } } : {}),
    },
    select: { slug: true },
  });

  if (!matches.some((match) => match.slug === baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (matches.some((match) => match.slug === `${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

function normalizeAgentInfo(payload: AgentCreatePayload): AgentInfo {
  const name = normalizeText(payload.name);
  const purpose = normalizeText(payload.purpose);
  const allowedTasks = normalizeText(payload.allowed_tasks);
  const restrictions = normalizeText(payload.restrictions);

  const baseInfo = {
    role: deriveRoleFromName(name),
    goal: purpose,
    responsibilities: allowedTasks,
    permissions: `Only help with the following approved work:\n${allowedTasks}`,
    guardrails: restrictions,
    work_style:
      "Be clear, practical, concise, and supportive. Optimize for the assigned employee's workflow.",
  };
  const allowedToolkits = normalizeToolkitList(payload.allowed_toolkits ?? []);

  return {
    ...baseInfo,
    allowed_toolkits: allowedToolkits,
    allowed_tool_ids: [],
    workspace: {
      mode: "chat",
      objective: purpose || fallbackWorkspaceObjective(name),
      primary_deliverables:
        allowedTasks || "Produce clear, usable outputs inside the assigned workspace.",
      collaboration_notes:
        "Support the assigned employee directly, keep context explicit, and surface blockers early.",
    },
  };
}

async function resolveUserAssignments(assignedUserEmails: string[], companyId: string) {
  const normalizedEmails = normalizeEmailList(assignedUserEmails);
  const resolvedUsers = await getUsersByEmails(normalizedEmails, companyId);
  const resolvedUserIds = normalizeStringList(resolvedUsers.map((user) => user.id));
  const missingEmails = normalizedEmails.filter(
    (email) => !resolvedUsers.some((user) => user.email.toLowerCase() === email),
  );

  if (missingEmails.length > 0) {
    throw new Error(`Employee not found for email: ${missingEmails.join(", ")}`);
  }

  return resolvedUserIds;
}

function resolveRoleAssignments(assignedRoleKeys: string[]) {
  return normalizeStringList(assignedRoleKeys);
}

export async function listAgents(): Promise<AgentRecord[]> {
  const agents = await prisma.agent.findMany({
    include: agentInclude,
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  });

  return agents.map(toAgentRecord);
}

export async function getAgentById(agentId: string): Promise<AgentRecord | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: agentInclude,
  });

  return agent ? toAgentRecord(agent) : null;
}

export async function createAgent(
  payload: AgentCreatePayload,
  actor?: AuthenticatedUser,
): Promise<AgentRecord> {
  const now = new Date();
  const id = randomUUID();
  const name = normalizeText(payload.name);
  const slug = await buildUniqueSlug(name);
  const agentInfo = normalizeAgentInfo(payload);
  const companyId = actor?.company_id ?? defaultCompanyId;
  const assignedRoles = resolveRoleAssignments(payload.assigned_role_keys ?? []);
  const resolvedUserIds = await resolveUserAssignments(
    payload.assigned_user_emails ?? [],
    companyId,
  );
  const systemPrompt = await compileAgentSystemPrompt(name, agentInfo);

  await prisma.$transaction(async (tx) => {
    await tx.agent.create({
      data: {
        id,
        companyId,
        createdByUserId: actor?.id ?? defaultAdminUserId,
        updatedByUserId: actor?.id ?? defaultAdminUserId,
        name,
        slug,
        agentInfo: agentInfo as unknown as Prisma.InputJsonValue,
        systemPrompt,
        promptVersion: 1,
        systemPromptGeneratedAt: now,
        isSystem: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (assignedRoles.length > 0) {
      await tx.agentRoleAssignment.createMany({
        data: assignedRoles.map((roleKey) => ({
          agentId: id,
          companyId,
          roleKey,
          createdAt: now,
        })),
        skipDuplicates: true,
      });
    }

    if (resolvedUserIds.length > 0) {
      await tx.agentUserAssignment.createMany({
        data: resolvedUserIds.map((userId) => ({
          agentId: id,
          companyId,
          userId,
          createdAt: now,
        })),
        skipDuplicates: true,
      });
    }
  });

  const agent = await getAgentById(id);
  if (!agent) {
    throw new Error("Failed to load created agent.");
  }

  return agent;
}

export async function updateAgent(
  agentId: string,
  payload: AgentUpdatePayload,
  actor: AuthenticatedUser,
): Promise<AgentRecord> {
  const existingAgent = await getAgentById(agentId);
  if (!existingAgent || existingAgent.company_id !== actor.company_id) {
    throw new Error("Agent not found.");
  }

  // The seeded Admin agent is the MVP stand-in for a customer-created admin agent:
  // it stays editable, but archive/removal remains blocked below.
  const now = new Date();
  const companyId = actor.company_id;
  const name = normalizeText(payload.name);
  const slug = await buildUniqueSlug(name, agentId);
  const agentInfo = normalizeAgentInfo(payload);
  const systemPrompt = await compileAgentSystemPrompt(name, agentInfo);
  const nextAssignedRoles =
    payload.assigned_role_keys === undefined
      ? null
      : resolveRoleAssignments(payload.assigned_role_keys);
  const nextResolvedUserIds =
    payload.assigned_user_emails === undefined
      ? null
      : await resolveUserAssignments(payload.assigned_user_emails, companyId);

  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.agent.updateMany({
      where: {
        id: agentId,
        companyId,
      },
      data: {
        name,
        slug,
        agentInfo: agentInfo as unknown as Prisma.InputJsonValue,
        systemPrompt,
        promptVersion: {
          increment: 1,
        },
        systemPromptGeneratedAt: now,
        updatedByUserId: actor.id,
        updatedAt: now,
      },
    });

    if (updateResult.count === 0) {
      throw new Error("Agent not found.");
    }

    if (nextAssignedRoles !== null) {
      await tx.agentRoleAssignment.deleteMany({
        where: {
          agentId,
          companyId,
        },
      });

      if (nextAssignedRoles.length > 0) {
        await tx.agentRoleAssignment.createMany({
          data: nextAssignedRoles.map((roleKey) => ({
            agentId,
            companyId,
            roleKey,
            createdAt: now,
          })),
        });
      }
    }

    if (nextResolvedUserIds !== null) {
      await tx.agentUserAssignment.deleteMany({
        where: {
          agentId,
          companyId,
        },
      });

      if (nextResolvedUserIds.length > 0) {
        await tx.agentUserAssignment.createMany({
          data: nextResolvedUserIds.map((userId) => ({
            agentId,
            companyId,
            userId,
            createdAt: now,
          })),
        });
      }
    }
  });

  const updatedAgent = await getAgentById(agentId);
  if (!updatedAgent) {
    throw new Error("Failed to load updated agent.");
  }

  return updatedAgent;
}

export async function archiveAgent(
  agentId: string,
  actor: AuthenticatedUser,
): Promise<AgentRecord> {
  const existingAgent = await getAgentById(agentId);
  if (!existingAgent || existingAgent.company_id !== actor.company_id) {
    throw new Error("Agent not found.");
  }
  if (existingAgent.is_system) {
    throw new Error("System agents cannot be archived.");
  }
  if (existingAgent.archived_at) {
    return existingAgent;
  }

  await prisma.agent.updateMany({
    where: {
      id: agentId,
      companyId: actor.company_id,
    },
    data: {
      archivedAt: new Date(),
      updatedAt: new Date(),
      updatedByUserId: actor.id,
    },
  });

  const archivedAgent = await getAgentById(agentId);
  if (!archivedAgent) {
    throw new Error("Failed to load archived agent.");
  }

  return archivedAgent;
}
