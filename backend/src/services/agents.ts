import { randomUUID } from "node:crypto";

import { settings } from "../config.js";
import { defaultAdminUserId, defaultCompanyId } from "../constants/seed.js";
import { query } from "../db/postgres.js";
import { compileAgentSystemPrompt } from "../langgraph/agent-prompt-compiler.js";
import { getUsersByEmails } from "./users.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type { AgentCreatePayload, AgentInfo, AgentRecord } from "../types/agents.js";

const appSchema = `"${settings.appSchema.replaceAll('"', '""')}"`;
const agentsTable = `${appSchema}.agents`;
const roleAssignmentsTable = `${appSchema}.agent_role_assignments`;
const userAssignmentsTable = `${appSchema}.agent_user_assignments`;

type AgentRow = AgentRecord;

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

function normalizeEmailList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function fallbackWorkspaceObjective(name: string): string {
  return `Own the ${name} workspace and help users complete its assigned work clearly and safely.`;
}

function deriveRoleFromName(name: string): string {
  return `${name} assistant`;
}

async function buildUniqueSlug(name: string): Promise<string> {
  const baseSlug = slugify(name) || "agent";
  const matches = await query<{ slug: string }>(
    `SELECT slug FROM ${agentsTable} WHERE slug = $1 OR slug LIKE $2`,
    [baseSlug, `${baseSlug}-%`],
  );

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

  return {
    role: deriveRoleFromName(name),
    goal: purpose,
    responsibilities: allowedTasks,
    permissions: `Only help with the following approved work:\n${allowedTasks}`,
    guardrails: restrictions,
    work_style:
      "Be clear, practical, concise, and supportive. Optimize for the assigned employee's workflow.",
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

export async function listAgents(): Promise<AgentRecord[]> {
  const rows = await query<AgentRow>(
    `SELECT
       a.id,
       a.company_id,
       a.created_by_user_id,
       a.updated_by_user_id,
       a.name,
       a.slug,
       a.agent_info,
       a.system_prompt,
       a.prompt_version,
       a.system_prompt_generated_at,
       a.is_system,
       a.created_at,
       a.updated_at,
       COALESCE(
         ARRAY_AGG(DISTINCT ar.role_key)
         FILTER (WHERE ar.role_key IS NOT NULL),
         ARRAY[]::TEXT[]
       ) AS assigned_roles,
       COALESCE(
         ARRAY_AGG(DISTINCT au.user_id::TEXT)
         FILTER (WHERE au.user_id IS NOT NULL),
         ARRAY[]::TEXT[]
       ) AS assigned_user_ids
     FROM ${agentsTable} a
     LEFT JOIN ${roleAssignmentsTable} ar
       ON ar.agent_id = a.id
     LEFT JOIN ${userAssignmentsTable} au
       ON au.agent_id = a.id
     GROUP BY a.id
     ORDER BY a.is_system DESC, a.created_at ASC`,
  );

  return rows satisfies AgentRecord[];
}

export async function getAgentById(agentId: string): Promise<AgentRecord | null> {
  const [agent] = await query<AgentRow>(
    `SELECT
       a.id,
       a.company_id,
       a.created_by_user_id,
       a.updated_by_user_id,
       a.name,
       a.slug,
       a.agent_info,
       a.system_prompt,
       a.prompt_version,
       a.system_prompt_generated_at,
       a.is_system,
       a.created_at,
       a.updated_at,
       COALESCE(
         ARRAY_AGG(DISTINCT ar.role_key)
         FILTER (WHERE ar.role_key IS NOT NULL),
         ARRAY[]::TEXT[]
       ) AS assigned_roles,
       COALESCE(
         ARRAY_AGG(DISTINCT au.user_id::TEXT)
         FILTER (WHERE au.user_id IS NOT NULL),
         ARRAY[]::TEXT[]
       ) AS assigned_user_ids
     FROM ${agentsTable} a
     LEFT JOIN ${roleAssignmentsTable} ar
       ON ar.agent_id = a.id
     LEFT JOIN ${userAssignmentsTable} au
       ON au.agent_id = a.id
     WHERE a.id = $1
     GROUP BY a.id`,
    [agentId],
  );

  return agent ?? null;
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
  const assignedRoles = normalizeStringList(payload.assigned_role_keys ?? []);
  const assignedUserEmails = normalizeEmailList(payload.assigned_user_emails ?? []);
  const companyId = actor?.company_id ?? defaultCompanyId;
  const resolvedUsers = await getUsersByEmails(assignedUserEmails, companyId);
  const resolvedUserIds = normalizeStringList(resolvedUsers.map((user) => user.id));
  const missingEmails = assignedUserEmails.filter(
    (email) => !resolvedUsers.some((user) => user.email.toLowerCase() === email),
  );

  if (missingEmails.length > 0) {
    throw new Error(`Employee not found for email: ${missingEmails.join(", ")}`);
  }

  const systemPrompt = await compileAgentSystemPrompt(name, agentInfo);

  await query(
    `INSERT INTO ${agentsTable}
     (
       id,
       company_id,
       created_by_user_id,
       updated_by_user_id,
       name,
       slug,
       agent_info,
       system_prompt,
       prompt_version,
       system_prompt_generated_at,
       is_system,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $10, $10)`,
    [
      id,
      companyId,
      actor?.id ?? defaultAdminUserId,
      actor?.id ?? defaultAdminUserId,
      name,
      slug,
      JSON.stringify(agentInfo),
      systemPrompt,
      1,
      now,
      false,
    ],
  );

  for (const roleKey of assignedRoles) {
    await query(
     `INSERT INTO ${roleAssignmentsTable}
       (agent_id, company_id, role_key, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [id, actor?.company_id ?? defaultCompanyId, roleKey, now],
    );
  }

  for (const userId of resolvedUserIds) {
    await query(
      `INSERT INTO ${userAssignmentsTable}
       (agent_id, company_id, user_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, user_id) DO NOTHING`,
      [id, companyId, userId, now],
    );
  }

  const agent = await getAgentById(id);
  if (!agent) {
    throw new Error("Failed to load created agent.");
  }

  return agent;
}
