# HumanTouch Schema

Updated: 2026-05-16

## Intent

HumanTouch now uses a product schema built around:

- real companies
- real users
- admin-created agents
- role-based and direct user assignment
- generated agent `system_prompt`
- per-session employee `user_prompt`
- session metadata in app tables
- LangChain `createAgent` runtime with LangGraph checkpointer thread state

This document is the canonical reference for future sessions.

## Schema Ownership

The current database uses separate PostgreSQL schemas for product data and runtime graph state:

- `humantouch`
  HumanTouch product tables. These are modeled in `backend/prisma/schema.prisma`.
- `langgraph`
  LangGraph checkpoint tables. These are created and maintained by LangGraph's `PostgresSaver`.
- `public`
  Default PostgreSQL schema. It is not the HumanTouch app-table target.

Prisma owns the HumanTouch product table model and migration history:

- Prisma schema file: `backend/prisma/schema.prisma`
- Prisma migrations directory: `backend/prisma/migrations/`
- Prisma migration history table: `humantouch._prisma_migrations`

The older custom migration history table still exists:

- `humantouch.schema_migrations`

That table belongs to the compatibility/bootstrap path. New product-table schema changes should prefer Prisma migrations. LangGraph checkpoint tables should not be added to Prisma.

## Core Model

### `companies`

One company owns users, agents, sessions, and assignments.

Columns:

- `id UUID PRIMARY KEY`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL UNIQUE`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### `users`

Represents real app users who will later sign in.

Columns:

- `id UUID PRIMARY KEY`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `email TEXT NOT NULL UNIQUE`
- `full_name TEXT NOT NULL`
- `role_key TEXT NOT NULL`
- `is_admin BOOLEAN NOT NULL`
- `auth_provider TEXT NOT NULL`
- `password_hash TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

Notes:

- `email` is used for identity lookup/login.
- internal access control and assignments should use `user_id`, not email.

### `auth_sessions`

Server-side login sessions for local auth.

Columns:

- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES users(id)`
- `token_hash TEXT NOT NULL UNIQUE`
- `expires_at TIMESTAMPTZ NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `last_seen_at TIMESTAMPTZ NOT NULL`

Notes:

- the browser stores only an opaque session token in an `HttpOnly` cookie
- the database stores a SHA-256 hash of that token, not the raw token
- logout deletes the matching row so sessions are revocable server-side

### `agents`

The canonical agent definition table.

Columns:

- `id UUID PRIMARY KEY`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `created_by_user_id UUID NOT NULL REFERENCES users(id)`
- `updated_by_user_id UUID NOT NULL REFERENCES users(id)`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL UNIQUE`
- `agent_info JSONB NOT NULL`
- `system_prompt TEXT NOT NULL`
- `prompt_version INTEGER NOT NULL`
- `system_prompt_generated_at TIMESTAMPTZ NOT NULL`
- `is_system BOOLEAN NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

Legacy compatibility columns still exist in the current database bootstrap:

- `purpose`
- `prompt`
- `role`
- `goal`
- `responsibilities`
- `permissions`
- `guardrails`
- `work_style`

Those are treated as migration support only. The canonical source of truth is:

- `agent_info`
- `system_prompt`

Recommended `agent_info` structure:

- `role TEXT`
- `goal TEXT`
- `responsibilities TEXT`
- `permissions TEXT`
- `guardrails TEXT`
- `work_style TEXT`
- `allowed_toolkits TEXT[]`
- `allowed_tool_ids TEXT[]` legacy/unused; new writes store `[]`
- `workspace JSON`

Recommended `workspace` structure:

- `mode TEXT`
  expected values today: `chat`, `agentic`
- `objective TEXT`
- `primary_deliverables TEXT`
- `collaboration_notes TEXT`

Notes:

- keep runtime-critical prompt inputs in `agent_info` so `system_prompt` can always be regenerated
- keep early agent workspace configuration in `agent_info.workspace` until runs, artifacts, and tool policies justify dedicated tables
- Composio is the default tool source for runtime; `allowed_toolkits` currently supports optional restrictions to `gmail` and `github`
- when `allowed_toolkits` is empty, Composio default meta-tools can discover available toolkits at runtime
- `allowed_tool_ids` is ignored for now
- there is no HumanTouch-owned local tool catalog route or individual tool-action assignment behavior
- move to dedicated tool-policy tables only when per-company catalogs or per-agent fine-grained action permissions require it
- if the future agentic workspace gains stateful execution or artifacts, model that separately from conversation history

### `agent_role_assignments`

Role-based access to agents.

Columns:

- `agent_id UUID NOT NULL REFERENCES agents(id)`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `role_key TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Primary key:

- `(agent_id, role_key)`

### `agent_user_assignments`

Direct user-to-agent access for exceptions and explicit assignment.

Columns:

- `agent_id UUID NOT NULL REFERENCES agents(id)`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `user_id UUID NOT NULL REFERENCES users(id)`
- `created_at TIMESTAMPTZ NOT NULL`

Primary key:

- `(agent_id, user_id)`

### `agent_sessions`

Session metadata for the UI and access model.

Columns:

- `thread_id UUID PRIMARY KEY`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `created_by_user_id UUID NOT NULL REFERENCES users(id)`
- `title TEXT NOT NULL`
- `agent_id UUID NOT NULL REFERENCES agents(id)`
- `user_prompt TEXT NULL`
- `system_prompt_used TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

Notes:

- `user_prompt` is the employee style layer for that specific conversation.
- `system_prompt_used` snapshots the prompt used by the session, so agent edits later do not silently rewrite old conversation behavior.

### `agent_messages`

SQL-readable message history mirror for the product.

Columns:

- `id BIGSERIAL PRIMARY KEY`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `thread_id UUID NOT NULL REFERENCES agent_sessions(thread_id)`
- `role TEXT NOT NULL CHECK (role IN ('user', 'assistant'))`
- `content TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

## Prompt Layering

Runtime prompt order:

1. platform rules
2. stored `agents.system_prompt`
3. optional `agent_sessions.user_prompt`
4. actual user message

## Agent Runtime State

The backend builds selected-agent runtime context for every chat request before
calling LangChain `createAgent`. This context is the runtime contract between
Fastify/Prisma services and the agent runner.

Current state contents:

- authenticated user id, company id, role key, and admin flag
- selected session id, selected agent id, stored `system_prompt_used`, and optional `user_prompt`
- selected agent id, slug, structured `agent_info`, current `system_prompt`, and system flag
- latest input message
- product-readable user/assistant message history from `agent_messages`
- current HumanTouch user for Composio session/tool loading

There is no custom HumanTouch workflow graph for normal chat. The selected
agent remains dynamic and comes from the session/database, not from hardcoded
workflow files.

## Prompt Generation

Agent creation/update should use a nested contract:

- `name`
- `agent_info`
  `role`, `goal`, `responsibilities`, `permissions`, `guardrails`, `work_style`, `allowed_toolkits`, `allowed_tool_ids`, `workspace`
- `assignments`
  `role_keys`, `user_ids`

These are assembled into `agent_info`, and a generated `system_prompt` is stored for runtime use.

Current implementation:

- prompt generation happens on create
- the generator attempts an LLM-based compile step
- if that fails, it falls back to a deterministic template prompt
- toolkit assignment supports optional Gmail/GitHub restrictions; `allowed_tool_ids` remains in `agent_info` as ignored legacy data
- `agent-runtime.ts` invokes LangChain `createAgent` with Gemini and Composio meta-tools, applying selected toolkit restrictions when present and falling back to `tools: []` on Composio failure

## Current Seed Data

The app seeds these default records:

- one company
- one admin user
- one built-in `Admin` agent

Seed IDs:

- company: `00000000-0000-0000-0000-000000000001`
- admin user: `00000000-0000-0000-0000-000000000001`
- admin agent: `00000000-0000-0000-0000-000000000001`

The identical UUID values are safe because they live in different tables, but future migrations may split them to make debugging clearer.

## Access Rules

Admin:

- can create agents
- can edit agents
- can assign by role
- can assign directly to users
- can use any non-archived agent in the same company, including agents assigned to employees

Normal user:

- cannot create agents
- only sees agents granted through:
  - `agent_role_assignments`
  - `agent_user_assignments`

## Checkpointer Boundary

LangGraph checkpointer is used for:

- `createAgent` thread state
- resumable conversation execution

Current LangGraph tables live in the `langgraph` schema:

- `checkpoint_blobs`
- `checkpoint_migrations`
- `checkpoint_writes`
- `checkpoints`

App tables are used for:

- product records
- session listing
- ownership
- access control
- explicit message history

The checkpointer is not the only source of truth for the product model.

Prisma should not manage the LangGraph checkpoint tables. The product-readable session and message history remains in `humantouch.agent_sessions` and `humantouch.agent_messages`.
