import { Pool, type QueryResultRow } from "pg";

import { settings } from "../config.js";
import {
  defaultAdminAgentId,
  defaultAdminUserId,
  defaultCompanyId,
  defaultEmployeeAgentId,
} from "../constants/seed.js";
import { runMigrations } from "./migrations.js";
import { buildAgentContext } from "../services/agent-context.js";
import { hashPassword } from "../services/passwords.js";
import type { AgentInfo } from "../types/agents.js";

const pool = new Pool({
  connectionString: settings.databaseUrl,
});

let initializationPromise: Promise<void> | null = null;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function initializeDatabase(): Promise<void> {
  const appSchema = quoteIdentifier(settings.appSchema);
  const appSchemaLiteral = quoteLiteral(settings.appSchema);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${appSchema}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.companies (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.users (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES ${appSchema}.companies(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role_key TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      password_hash TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.agents (
      id UUID PRIMARY KEY,
      company_id UUID NULL,
      created_by_user_id UUID NULL,
      updated_by_user_id UUID NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Admin',
      goal TEXT NOT NULL DEFAULT '',
      responsibilities TEXT NOT NULL DEFAULT '',
      permissions TEXT NOT NULL DEFAULT '',
      guardrails TEXT NOT NULL DEFAULT '',
      work_style TEXT NOT NULL DEFAULT '',
      agent_info JSONB NOT NULL DEFAULT '{}'::jsonb,
      system_prompt TEXT NOT NULL DEFAULT '',
      prompt_version INTEGER NOT NULL DEFAULT 1,
      system_prompt_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS company_id UUID NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Admin'
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS responsibilities TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS permissions TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS guardrails TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS work_style TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS agent_info JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS system_prompt TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS prompt_version INTEGER NOT NULL DEFAULT 1
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS system_prompt_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.agent_role_assignments (
      agent_id UUID NOT NULL REFERENCES ${appSchema}.agents(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES ${appSchema}.companies(id) ON DELETE CASCADE,
      role_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (agent_id, role_key)
    )
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ADD COLUMN IF NOT EXISTS company_id UUID NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ADD COLUMN IF NOT EXISTS role_key TEXT
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${appSchemaLiteral}
          AND table_name = 'agent_role_assignments'
          AND column_name = 'role_name'
      ) THEN
        EXECUTE $sql$
          UPDATE ${appSchema}.agent_role_assignments
          SET role_key = COALESCE(role_key, role_name)
        $sql$;
      END IF;
    END $$;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${appSchemaLiteral}
          AND table_name = 'agent_role_assignments'
          AND column_name = 'role_name'
      ) THEN
        EXECUTE $sql$
          ALTER TABLE ${appSchema}.agent_role_assignments
          ALTER COLUMN role_name SET DEFAULT ''
        $sql$;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.agent_user_assignments (
      agent_id UUID NOT NULL REFERENCES ${appSchema}.agents(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES ${appSchema}.companies(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES ${appSchema}.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (agent_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.agent_sessions (
      thread_id UUID PRIMARY KEY,
      company_id UUID NULL,
      created_by_user_id UUID NULL,
      title TEXT NOT NULL,
      agent_id UUID NOT NULL,
      user_prompt TEXT NULL,
      system_prompt_used TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT agent_sessions_agent_id_fkey
        FOREIGN KEY (agent_id) REFERENCES ${appSchema}.agents(id)
    )
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD COLUMN IF NOT EXISTS company_id UUID NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD COLUMN IF NOT EXISTS user_prompt TEXT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD COLUMN IF NOT EXISTS system_prompt_used TEXT NOT NULL DEFAULT ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.agent_messages (
      id BIGSERIAL PRIMARY KEY,
      company_id UUID NULL,
      thread_id UUID NOT NULL REFERENCES ${appSchema}.agent_sessions(thread_id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_messages
    ADD COLUMN IF NOT EXISTS company_id UUID NULL
  `);

  await seedDefaultCompanyAndUser(appSchema);
  await updateSeededAdminCredentials();
  await backfillAgents(appSchema);
  await seedDefaultAdminAgent(appSchema);
  await backfillAssignments(appSchema);
  await backfillSessions(appSchema);
  await backfillMessages(appSchema);

  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ALTER COLUMN company_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ALTER COLUMN created_by_user_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ALTER COLUMN updated_by_user_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ALTER COLUMN company_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ALTER COLUMN created_by_user_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_messages
    ALTER COLUMN company_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ALTER COLUMN company_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ALTER COLUMN role_key SET NOT NULL
  `);

  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    DROP CONSTRAINT IF EXISTS agents_company_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD CONSTRAINT agents_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES ${appSchema}.companies(id)
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    DROP CONSTRAINT IF EXISTS agents_created_by_user_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD CONSTRAINT agents_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES ${appSchema}.users(id)
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    DROP CONSTRAINT IF EXISTS agents_updated_by_user_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD CONSTRAINT agents_updated_by_user_id_fkey
      FOREIGN KEY (updated_by_user_id) REFERENCES ${appSchema}.users(id)
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    DROP CONSTRAINT IF EXISTS agent_sessions_company_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD CONSTRAINT agent_sessions_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES ${appSchema}.companies(id)
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    DROP CONSTRAINT IF EXISTS agent_sessions_created_by_user_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD CONSTRAINT agent_sessions_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES ${appSchema}.users(id)
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_messages
    DROP CONSTRAINT IF EXISTS agent_messages_company_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_messages
    ADD CONSTRAINT agent_messages_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES ${appSchema}.companies(id)
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    DROP CONSTRAINT IF EXISTS agent_role_assignments_company_id_fkey
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ADD CONSTRAINT agent_role_assignments_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES ${appSchema}.companies(id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_sessions_updated_at_idx
    ON ${appSchema}.agent_sessions (updated_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_messages_thread_created_at_idx
    ON ${appSchema}.agent_messages (thread_id, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS agents_slug_idx
    ON ${appSchema}.agents (slug)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_role_assignments_role_key_idx
    ON ${appSchema}.agent_role_assignments (role_key)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS agent_user_assignments_user_id_idx
    ON ${appSchema}.agent_user_assignments (user_id)
  `);
}

async function addAuthSessionsTable(): Promise<void> {
  const appSchema = quoteIdentifier(settings.appSchema);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.auth_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES ${appSchema}.users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
    ON ${appSchema}.auth_sessions (user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
    ON ${appSchema}.auth_sessions (expires_at)
  `);
}

async function updateSeededAdminCredentials(): Promise<void> {
  const appSchema = quoteIdentifier(settings.appSchema);
  const adminPasswordHash = hashPassword("utkarshsingh");

  await pool.query(
    `
      UPDATE ${appSchema}.users
      SET
        email = $2,
        full_name = $3,
        role_key = 'admin',
        is_admin = TRUE,
        auth_provider = 'local',
        password_hash = $4,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      defaultAdminUserId,
      "utkarshsingh@gmail.com",
      "Utkarsh Singh",
      adminPasswordHash,
    ],
  );
}

async function seedDefaultCompanyAndUser(appSchema: string): Promise<void> {
  const now = new Date();
  const adminPasswordHash = hashPassword("utkarshsingh");

  await pool.query(
    `
      INSERT INTO ${appSchema}.companies (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = EXCLUDED.updated_at
    `,
    [defaultCompanyId, "CemberAI Demo Company", "cemberai-demo", now],
  );

  await pool.query(
    `
      INSERT INTO ${appSchema}.users
      (id, company_id, email, full_name, role_key, is_admin, auth_provider, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, TRUE, 'local', $6, $7, $7)
      ON CONFLICT (id) DO UPDATE
      SET
        company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role_key = EXCLUDED.role_key,
        is_admin = TRUE,
        auth_provider = 'local',
        password_hash = EXCLUDED.password_hash,
        updated_at = EXCLUDED.updated_at
    `,
    [
      defaultAdminUserId,
      defaultCompanyId,
      "utkarshsingh@gmail.com",
      "Utkarsh Singh",
      "admin",
      adminPasswordHash,
      now,
    ],
  );
}

async function backfillAgents(appSchema: string): Promise<void> {
  await pool.query(`
    UPDATE ${appSchema}.agents
    SET
      company_id = COALESCE(company_id, '${defaultCompanyId}'),
      created_by_user_id = COALESCE(created_by_user_id, '${defaultAdminUserId}'),
      updated_by_user_id = COALESCE(updated_by_user_id, '${defaultAdminUserId}'),
      role = COALESCE(NULLIF(role, ''), CASE WHEN lower(name) = 'admin' THEN 'Admin' ELSE name END),
      goal = COALESCE(NULLIF(goal, ''), COALESCE(NULLIF(purpose, ''), 'Support assigned work clearly and safely.')),
      responsibilities = COALESCE(NULLIF(responsibilities, ''), 'Carry out the assigned operational responsibilities.'),
      permissions = COALESCE(NULLIF(permissions, ''), 'Only act within the permissions explicitly given to you.'),
      guardrails = COALESCE(NULLIF(guardrails, ''), 'Do not exceed your scope, and surface uncertainty clearly.'),
      work_style = COALESCE(NULLIF(work_style, ''), 'Be clear, concise, and practical.')
  `);

  const agents = await pool.query<{
    id: string;
    name: string;
    role: string;
    goal: string;
    responsibilities: string;
    permissions: string;
    guardrails: string;
    work_style: string;
    agent_info: Record<string, unknown>;
    system_prompt: string;
  }>(
    `
      SELECT
        id,
        name,
        role,
        goal,
        responsibilities,
        permissions,
        guardrails,
        work_style,
        agent_info,
        system_prompt
      FROM ${appSchema}.agents
    `,
  );

  for (const agent of agents.rows) {
    const existingWorkspace =
      agent.agent_info && typeof agent.agent_info === "object" && "workspace" in agent.agent_info
        ? (agent.agent_info as { workspace?: unknown }).workspace
        : null;
    const baseInfo = {
      role: agent.role,
      goal: agent.goal,
      responsibilities: agent.responsibilities,
      permissions: agent.permissions,
      guardrails: agent.guardrails,
      work_style: agent.work_style,
    };
    const agentInfo: AgentInfo = {
      ...baseInfo,
      allowed_toolkits: [],
      allowed_tool_ids: [],
      workspace: {
        mode:
          existingWorkspace &&
          typeof existingWorkspace === "object" &&
          "mode" in existingWorkspace &&
          existingWorkspace.mode === "agentic"
            ? "agentic"
            : "chat",
        objective:
          existingWorkspace &&
          typeof existingWorkspace === "object" &&
          "objective" in existingWorkspace &&
          typeof existingWorkspace.objective === "string" &&
          existingWorkspace.objective.trim()
            ? existingWorkspace.objective
            : `Own the ${agent.name} workspace and help users complete its assigned work clearly and safely.`,
        primary_deliverables:
          existingWorkspace &&
          typeof existingWorkspace === "object" &&
          "primary_deliverables" in existingWorkspace &&
          typeof existingWorkspace.primary_deliverables === "string" &&
          existingWorkspace.primary_deliverables.trim()
            ? existingWorkspace.primary_deliverables
            : "Produce clear, usable outputs inside the assigned workspace.",
        collaboration_notes:
          existingWorkspace &&
          typeof existingWorkspace === "object" &&
          "collaboration_notes" in existingWorkspace &&
          typeof existingWorkspace.collaboration_notes === "string" &&
          existingWorkspace.collaboration_notes.trim()
            ? existingWorkspace.collaboration_notes
            : "Collaborate in a structured way, keep context explicit, and surface blockers early.",
      },
    };
    const systemPrompt =
      agent.system_prompt.trim() || buildAgentContext(agent.name, agentInfo);

    await pool.query(
      `
        UPDATE ${appSchema}.agents
        SET
          agent_info = $2::jsonb,
          system_prompt = $3,
          prompt_version = COALESCE(prompt_version, 1),
          system_prompt_generated_at = COALESCE(system_prompt_generated_at, NOW())
        WHERE id = $1
      `,
      [agent.id, JSON.stringify(agentInfo), systemPrompt],
    );
  }
}

async function backfillAssignments(appSchema: string): Promise<void> {
  await pool.query(`
    UPDATE ${appSchema}.agent_role_assignments
    SET
      company_id = COALESCE(company_id, '${defaultCompanyId}'),
      role_key = COALESCE(NULLIF(role_key, ''), 'admin')
  `);

  const legacyRoleNameColumn = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'agent_role_assignments'
          AND column_name = 'role_name'
      ) AS exists
    `,
    [settings.appSchema],
  );

  if (legacyRoleNameColumn.rows[0]?.exists) {
    await pool.query(`
      UPDATE ${appSchema}.agent_role_assignments
      SET role_key = COALESCE(NULLIF(role_key, ''), role_name, 'admin')
    `);
  }

  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ALTER COLUMN company_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_role_assignments
    ALTER COLUMN role_key SET NOT NULL
  `);
}

async function backfillSessions(appSchema: string): Promise<void> {
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ALTER COLUMN agent_id DROP DEFAULT
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    DROP CONSTRAINT IF EXISTS agent_sessions_agent_id_fkey
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = ${quoteLiteral(settings.appSchema)}
          AND table_name = 'agent_sessions'
          AND column_name = 'agent_id'
          AND data_type <> 'uuid'
      ) THEN
        ALTER TABLE ${appSchema}.agent_sessions
        ALTER COLUMN agent_id DROP NOT NULL;

        UPDATE ${appSchema}.agent_sessions
        SET agent_id = '${defaultAdminAgentId}'
        WHERE agent_id IS DISTINCT FROM '${defaultAdminAgentId}';

        ALTER TABLE ${appSchema}.agent_sessions
        ALTER COLUMN agent_id TYPE UUID
        USING agent_id::uuid;
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE ${appSchema}.agent_sessions s
    SET
      company_id = COALESCE(s.company_id, '${defaultCompanyId}'),
      created_by_user_id = COALESCE(s.created_by_user_id, '${defaultAdminUserId}'),
      agent_id = COALESCE(s.agent_id, '${defaultAdminAgentId}')
  `);

  await pool.query(`
    UPDATE ${appSchema}.agent_sessions s
    SET system_prompt_used = COALESCE(NULLIF(s.system_prompt_used, ''), a.system_prompt)
    FROM ${appSchema}.agents a
    WHERE s.agent_id = a.id
  `);

  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ALTER COLUMN agent_id SET NOT NULL
  `);
  await pool.query(`
    ALTER TABLE ${appSchema}.agent_sessions
    ADD CONSTRAINT agent_sessions_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES ${appSchema}.agents(id)
  `);
}

async function backfillMessages(appSchema: string): Promise<void> {
  await pool.query(`
    UPDATE ${appSchema}.agent_messages m
    SET company_id = COALESCE(m.company_id, s.company_id)
    FROM ${appSchema}.agent_sessions s
    WHERE m.thread_id = s.thread_id
  `);
}

async function seedDefaultAdminAgent(appSchema: string): Promise<void> {
  const now = new Date();
  const baseInfo = {
    role: "Admin",
    goal: "Manage CemberAI agent operations for the company, plan work, and oversee system use.",
    responsibilities:
      "Review requests, plan execution, coordinate work, inspect architecture, and support future agent management decisions.",
    permissions:
      "Access agent-related product context, review sessions, propose plans, and help organize operational work within the application scope.",
    guardrails:
      "Do not claim to have permissions that are not explicitly available. Do not take sensitive external actions without approval. Stay inside product and operational scope.",
    work_style:
      "Be concise, practical, structured, and operationally focused. Surface assumptions and risks clearly.",
  };
  const agentInfo: AgentInfo = {
    ...baseInfo,
    allowed_toolkits: [],
    allowed_tool_ids: [],
    workspace: {
      mode: "agentic" as const,
      objective:
        "Operate the admin workspace for CemberAI and help manage agent setup, review, and operational decisions.",
      primary_deliverables:
        "Produce plans, agent definitions, prompt guidance, and operational recommendations that the admin can act on.",
      collaboration_notes:
        "Work as an operational partner for the admin, keep assumptions explicit, and suggest next actions clearly.",
    },
  };
  const systemPrompt = buildAgentContext("Admin", agentInfo);

  await pool.query(
    `
      INSERT INTO ${appSchema}.agents AS existing_agent
      (
        id,
        company_id,
        created_by_user_id,
        updated_by_user_id,
        name,
        slug,
        purpose,
        prompt,
        role,
        goal,
        responsibilities,
        permissions,
        guardrails,
        work_style,
        agent_info,
        system_prompt,
        prompt_version,
        system_prompt_generated_at,
        is_system,
        created_at,
        updated_at
      )
      VALUES
      (
        $1, $2, $3, $3, 'Admin', 'admin', '', '', $4, $5, $6, $7, $8, $9,
        $10::jsonb, $11, 1, $12, TRUE, $12, $12
      )
      ON CONFLICT (id) DO UPDATE
      SET
        company_id = COALESCE(existing_agent.company_id, EXCLUDED.company_id),
        created_by_user_id = COALESCE(existing_agent.created_by_user_id, EXCLUDED.created_by_user_id),
        updated_by_user_id = COALESCE(existing_agent.updated_by_user_id, EXCLUDED.updated_by_user_id),
        slug = COALESCE(NULLIF(existing_agent.slug, ''), EXCLUDED.slug),
        prompt_version = COALESCE(existing_agent.prompt_version, EXCLUDED.prompt_version),
        system_prompt_generated_at = COALESCE(
          existing_agent.system_prompt_generated_at,
          EXCLUDED.system_prompt_generated_at
        ),
        is_system = TRUE,
        updated_at = existing_agent.updated_at
    `,
    [
      defaultAdminAgentId,
      defaultCompanyId,
      defaultAdminUserId,
      agentInfo.role,
      agentInfo.goal,
      agentInfo.responsibilities,
      agentInfo.permissions,
      agentInfo.guardrails,
      agentInfo.work_style,
      JSON.stringify(agentInfo),
      systemPrompt,
      now,
    ],
  );

  await pool.query(
    `
      INSERT INTO ${appSchema}.agent_role_assignments
      (agent_id, company_id, role_key, created_at)
      VALUES ($1, $2, 'admin', $3)
      ON CONFLICT DO NOTHING
    `,
    [defaultAdminAgentId, defaultCompanyId, now],
  );

  await pool.query(
    `
      UPDATE ${appSchema}.agent_sessions
      SET
        agent_id = COALESCE(agent_id, '${defaultAdminAgentId}'),
        system_prompt_used = CASE
          WHEN system_prompt_used = '' THEN $1
          ELSE system_prompt_used
        END
      WHERE agent_id IS NULL OR system_prompt_used = ''
    `,
    [systemPrompt],
  );
}

async function seedDefaultEmployeeAgent(appSchema: string): Promise<void> {
  const now = new Date();
  const baseInfo = {
    role: "Assistant",
    goal: "Help employees with their day-to-day tasks, answer questions, draft content, and support their work.",
    responsibilities:
      "Assist with writing, research, brainstorming, summarizing, and general productivity tasks assigned by the employee.",
    permissions:
      "Respond to employee queries within the scope of general workplace assistance. Use connected tools when available.",
    guardrails:
      "Do not access or modify company-wide settings. Do not claim admin-level permissions. Stay within the scope of the employee's request.",
    work_style:
      "Be helpful, clear, and conversational. Provide actionable answers and ask clarifying questions when needed.",
  };
  const agentInfo: AgentInfo = {
    ...baseInfo,
    allowed_toolkits: [],
    allowed_tool_ids: [],
    workspace: {
      mode: "chat" as const,
      objective:
        "Serve as a general-purpose assistant for employees, helping them get work done efficiently.",
      primary_deliverables:
        "Clear answers, drafted content, summaries, and practical support for everyday tasks.",
      collaboration_notes:
        "Work as a helpful partner. Keep responses practical and focused on what the employee needs.",
    },
  };
  const systemPrompt = buildAgentContext("Assistant", agentInfo);

  await pool.query(
    `
      INSERT INTO ${appSchema}.agents AS existing_agent
      (
        id,
        company_id,
        created_by_user_id,
        updated_by_user_id,
        name,
        slug,
        purpose,
        prompt,
        role,
        goal,
        responsibilities,
        permissions,
        guardrails,
        work_style,
        agent_info,
        system_prompt,
        prompt_version,
        system_prompt_generated_at,
        is_system,
        created_at,
        updated_at
      )
      VALUES
      (
        $1, $2, $3, $3, 'Assistant', 'assistant', '', '', $4, $5, $6, $7, $8, $9,
        $10::jsonb, $11, 1, $12, TRUE, $12, $12
      )
      ON CONFLICT (id) DO UPDATE
      SET
        company_id = COALESCE(existing_agent.company_id, EXCLUDED.company_id),
        created_by_user_id = COALESCE(existing_agent.created_by_user_id, EXCLUDED.created_by_user_id),
        updated_by_user_id = COALESCE(existing_agent.updated_by_user_id, EXCLUDED.updated_by_user_id),
        slug = COALESCE(NULLIF(existing_agent.slug, ''), EXCLUDED.slug),
        prompt_version = COALESCE(existing_agent.prompt_version, EXCLUDED.prompt_version),
        system_prompt_generated_at = COALESCE(
          existing_agent.system_prompt_generated_at,
          EXCLUDED.system_prompt_generated_at
        ),
        is_system = TRUE,
        updated_at = existing_agent.updated_at
    `,
    [
      defaultEmployeeAgentId,
      defaultCompanyId,
      defaultAdminUserId,
      agentInfo.role,
      agentInfo.goal,
      agentInfo.responsibilities,
      agentInfo.permissions,
      agentInfo.guardrails,
      agentInfo.work_style,
      JSON.stringify(agentInfo),
      systemPrompt,
      now,
    ],
  );

  await pool.query(
    `
      INSERT INTO ${appSchema}.agent_role_assignments
      (agent_id, company_id, role_key, created_at)
      VALUES ($1, $2, 'employee', $3)
      ON CONFLICT DO NOTHING
    `,
    [defaultEmployeeAgentId, defaultCompanyId, now],
  );
}

async function protectEditableDefaultAdminAgent(): Promise<void> {
  const appSchema = quoteIdentifier(settings.appSchema);
  const now = new Date();

  await pool.query(
    `
      UPDATE ${appSchema}.agents
      SET
        company_id = COALESCE(company_id, $2),
        created_by_user_id = COALESCE(created_by_user_id, $3),
        updated_by_user_id = COALESCE(updated_by_user_id, $3),
        is_system = TRUE
      WHERE id = $1
    `,
    [defaultAdminAgentId, defaultCompanyId, defaultAdminUserId],
  );

  await pool.query(
    `
      INSERT INTO ${appSchema}.agent_role_assignments
      (agent_id, company_id, role_key, created_at)
      VALUES ($1, $2, 'admin', $3)
      ON CONFLICT DO NOTHING
    `,
    [defaultAdminAgentId, defaultCompanyId, now],
  );
}

async function addAgentArchiving(): Promise<void> {
  const appSchema = quoteIdentifier(settings.appSchema);

  await pool.query(`
    ALTER TABLE ${appSchema}.agents
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agents_active_created_at_idx
    ON ${appSchema}.agents (company_id, is_system DESC, created_at ASC)
    WHERE archived_at IS NULL
  `);
}

export async function connectToPostgres(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = runMigrations([
      {
        id: "001_initial_cemberai_schema",
        run: initializeDatabase,
      },
      {
        id: "002_auth_sessions",
        run: addAuthSessionsTable,
      },
      {
        id: "003_seed_default_admin_credentials",
        run: updateSeededAdminCredentials,
      },
      {
        id: "004_agent_archiving",
        run: addAgentArchiving,
      },
      {
        id: "005_protect_editable_default_admin_agent",
        run: protectEditableDefaultAdminAgent,
      },
      {
        id: "006_seed_default_employee_agent",
        run: async () => {
          const appSchema = quoteIdentifier(settings.appSchema);
          await seedDefaultEmployeeAgent(appSchema);
        },
      },
    ]);
  }

  await initializationPromise;
}

export function getPgPool(): Pool {
  return pool;
}

export async function query<Row extends QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<Row[]> {
  const result = await pool.query<Row>(text, values);
  return result.rows;
}
