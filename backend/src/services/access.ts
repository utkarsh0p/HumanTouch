import { settings } from "../config.js";
import { query } from "../db/postgres.js";
import type { AuthenticatedUser } from "../types/auth.js";

const appSchema = `"${settings.appSchema.replaceAll('"', '""')}"`;
const agentsTable = `${appSchema}.agents`;
const roleAssignmentsTable = `${appSchema}.agent_role_assignments`;
const userAssignmentsTable = `${appSchema}.agent_user_assignments`;
const sessionsTable = `${appSchema}.agent_sessions`;
const fullAgentSelect = `SELECT
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
    ARRAY_AGG(DISTINCT ara.role_key)
    FILTER (WHERE ara.role_key IS NOT NULL),
    ARRAY[]::TEXT[]
  ) AS assigned_roles,
  COALESCE(
    ARRAY_AGG(DISTINCT aua.user_id::TEXT)
    FILTER (WHERE aua.user_id IS NOT NULL),
    ARRAY[]::TEXT[]
  ) AS assigned_user_ids
 FROM ${agentsTable} a
 LEFT JOIN ${roleAssignmentsTable} ara
   ON ara.agent_id = a.id
 LEFT JOIN ${userAssignmentsTable} aua
   ON aua.agent_id = a.id`;

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
    const [agent] = await query<{ id: string }>(
      `SELECT id FROM ${agentsTable}
       WHERE id = $1 AND company_id = $2`,
      [agentId, user.company_id],
    );
    return Boolean(agent);
  }

  const [direct] = await query<{ id: string }>(
    `SELECT a.id
     FROM ${agentsTable} a
     LEFT JOIN ${userAssignmentsTable} aua
       ON aua.agent_id = a.id
     LEFT JOIN ${roleAssignmentsTable} ara
       ON ara.agent_id = a.id
     WHERE a.id = $1
       AND a.company_id = $2
       AND (
         aua.user_id = $3
         OR ara.role_key = $4
       )`,
    [agentId, user.company_id, user.id, user.role_key],
  );

  return Boolean(direct);
}

export async function getAccessibleAgents(user: AuthenticatedUser) {
  if (user.is_admin) {
    return await query(
      `${fullAgentSelect}
       WHERE a.company_id = $1
       GROUP BY a.id
       ORDER BY a.is_system DESC, a.created_at ASC`,
      [user.company_id],
    );
  }

  return await query(
    `${fullAgentSelect}
     WHERE a.company_id = $1
       AND (
         aua.user_id = $2
         OR ara.role_key = $3
       )
     GROUP BY a.id
     ORDER BY a.is_system DESC, a.created_at ASC`,
    [user.company_id, user.id, user.role_key],
  );
}

export async function canUserAccessSession(
  user: AuthenticatedUser,
  threadId: string,
): Promise<boolean> {
  if (user.is_admin) {
    const [session] = await query<{ thread_id: string }>(
      `SELECT thread_id
       FROM ${sessionsTable}
       WHERE thread_id = $1 AND company_id = $2`,
      [threadId, user.company_id],
    );
    return Boolean(session);
  }

  const [session] = await query<{ thread_id: string }>(
    `SELECT thread_id
     FROM ${sessionsTable}
     WHERE thread_id = $1
       AND company_id = $2
       AND created_by_user_id = $3`,
    [threadId, user.company_id, user.id],
  );
  return Boolean(session);
}
