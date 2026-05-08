# HumanTouch Schema

Updated: 2026-05-08

## Intent

HumanTouch now uses a product schema built around:

- real companies
- real users
- admin-created agents
- role-based and direct user assignment
- generated agent `system_prompt`
- per-session employee `user_prompt`
- session metadata in app tables
- LangGraph checkpointer for runtime thread state

This document is the canonical reference for future sessions.

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

## Prompt Generation

Agent creation/update uses structured fields:

- `role`
- `goal`
- `responsibilities`
- `permissions`
- `guardrails`
- `work_style`

These are assembled into `agent_info`, and a generated `system_prompt` is stored for runtime use.

Current implementation:

- prompt generation happens on create
- the generator attempts an LLM-based compile step
- if that fails, it falls back to a deterministic template prompt

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

Normal user:

- cannot create agents
- only sees agents granted through:
  - `agent_role_assignments`
  - `agent_user_assignments`

## Checkpointer Boundary

LangGraph checkpointer is used for:

- graph thread state
- resumable conversation execution

App tables are used for:

- product records
- session listing
- ownership
- access control
- explicit message history

The checkpointer is not the only source of truth for the product model.
