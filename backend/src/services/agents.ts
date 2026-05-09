import { randomUUID } from "node:crypto";

import { settings } from "../config.js";
import { defaultAdminUserId, defaultCompanyId } from "../constants/seed.js";
import { getPgPool, query } from "../db/postgres.js";
import { compileAgentSystemPrompt } from "../langgraph/agent-prompt-compiler.js";
import { getUsersByEmails } from "./users.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type {
  AgentCreatePayload,
  AgentInfo,
  AgentRecord,
  AgentUpdatePayload,
} from "../types/agents.js";

const appSchema = `"${settings.appSchema.replaceAll('"', '""')}"`;
const agentsTable = `${appSchema}.agents`;
const roleAssignmentsTable = `${appSchema}.agent_role_assignments`;
const userAssignmentsTable = `${appSchema}.agent_user_assignments`;
const usersTable = `${appSchema}.users`;

type AgentRow = AgentRecord;

const baseAgentSelect = `SELECT
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
   a.archived_at,
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
   ) AS assigned_user_ids,
   COALESCE(
     ARRAY_AGG(DISTINCT u.email)
     FILTER (WHERE u.email IS NOT NULL),
     ARRAY[]::TEXT[]
   ) AS assigned_user_emails
 FROM ${agentsTable} a
 LEFT JOIN ${roleAssignmentsTable} ar
   ON ar.agent_id = a.id
 LEFT JOIN ${userAssignmentsTable} au
   ON au.agent_id = a.id
 LEFT JOIN ${usersTable} u
   ON u.id = au.user_id`;

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

async function buildUniqueSlug(name: string, excludeAgentId?: string): Promise<string> {
  const baseSlug = slugify(name) || "agent";
  const matches = await query<{ slug: string }>(
    `SELECT slug
     FROM ${agentsTable}
     WHERE (slug = $1 OR slug LIKE $2)
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [baseSlug, `${baseSlug}-%`, excludeAgentId ?? null],
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

async function resolveAssignments(
  assignedRoleKeys: string[],
  assignedUserEmails: string[],
  companyId: string,
) {
  const assignedRoles = normalizeStringList(assignedRoleKeys);
  const normalizedEmails = normalizeEmailList(assignedUserEmails);
  const resolvedUsers = await getUsersByEmails(normalizedEmails, companyId);
  const resolvedUserIds = normalizeStringList(resolvedUsers.map((user) => user.id));
  const missingEmails = normalizedEmails.filter(
    (email) => !resolvedUsers.some((user) => user.email.toLowerCase() === email),
  );

  if (missingEmails.length > 0) {
    throw new Error(`Employee not found for email: ${missingEmails.join(", ")}`);
  }

  return {
    assignedRoles,
    resolvedUserIds,
  };
}

export async function listAgents(): Promise<AgentRecord[]> {
  const rows = await query<AgentRow>(
    `${baseAgentSelect}
     GROUP BY a.id
     ORDER BY a.is_system DESC, a.created_at ASC`,
  );

  return rows satisfies AgentRecord[];
}

export async function getAgentById(agentId: string): Promise<AgentRecord | null> {
  const [agent] = await query<AgentRow>(
    `${baseAgentSelect}
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
  const companyId = actor?.company_id ?? defaultCompanyId;
  const { assignedRoles, resolvedUserIds } = await resolveAssignments(
    payload.assigned_role_keys ?? [],
    payload.assigned_user_emails ?? [],
    companyId,
  );
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
      [id, companyId, roleKey, now],
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

export async function updateAgent(
  agentId: string,
  payload: AgentUpdatePayload,
  actor: AuthenticatedUser,
): Promise<AgentRecord> {
  const existingAgent = await getAgentById(agentId);
  if (!existingAgent || existingAgent.company_id !== actor.company_id) {
    throw new Error("Agent not found.");
  }

  const now = new Date();
  const companyId = actor.company_id;
  const name = normalizeText(payload.name);
  const slug = await buildUniqueSlug(name, agentId);
  const agentInfo = normalizeAgentInfo(payload);
  const { assignedRoles, resolvedUserIds } = await resolveAssignments(
    payload.assigned_role_keys ?? [],
    payload.assigned_user_emails ?? [],
    companyId,
  );
  const systemPrompt = await compileAgentSystemPrompt(name, agentInfo);
  const pool = getPgPool();

  await pool.query("BEGIN");

  try {
    const updateResult = await pool.query(
      `UPDATE ${agentsTable}
       SET
         name = $3,
         slug = $4,
         agent_info = $5::jsonb,
         system_prompt = $6,
         prompt_version = prompt_version + 1,
         system_prompt_generated_at = $7,
         updated_by_user_id = $8,
         updated_at = $7
       WHERE id = $1
         AND company_id = $2
       RETURNING id`,
      [agentId, companyId, name, slug, JSON.stringify(agentInfo), systemPrompt, now, actor.id],
    );

    if (updateResult.rowCount === 0) {
      throw new Error("Agent not found.");
    }

    await pool.query(
      `DELETE FROM ${roleAssignmentsTable}
       WHERE agent_id = $1 AND company_id = $2`,
      [agentId, companyId],
    );
    await pool.query(
      `DELETE FROM ${userAssignmentsTable}
       WHERE agent_id = $1 AND company_id = $2`,
      [agentId, companyId],
    );

    for (const roleKey of assignedRoles) {
      await pool.query(
        `INSERT INTO ${roleAssignmentsTable}
         (agent_id, company_id, role_key, created_at)
         VALUES ($1, $2, $3, $4)`,
        [agentId, companyId, roleKey, now],
      );
    }

    for (const userId of resolvedUserIds) {
      await pool.query(
        `INSERT INTO ${userAssignmentsTable}
         (agent_id, company_id, user_id, created_at)
         VALUES ($1, $2, $3, $4)`,
        [agentId, companyId, userId, now],
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

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

  await query(
    `UPDATE ${agentsTable}
     SET archived_at = NOW(), updated_at = NOW(), updated_by_user_id = $3
     WHERE id = $1 AND company_id = $2`,
    [agentId, actor.company_id, actor.id],
  );

  const archivedAgent = await getAgentById(agentId);
  if (!archivedAgent) {
    throw new Error("Failed to load archived agent.");
  }

  return archivedAgent;
}
