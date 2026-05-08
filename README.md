# HumanTouch

HumanTouch is a company-facing webapp for creating and managing AI agents for employees.

The current backend direction now assumes a real company/user data model: companies, users, admin-managed agents, access assignments, session metadata, and LangGraph-backed chat execution. The architecture is still being shaped so this can later plug into a larger PostgreSQL-based business application instead of remaining a separate silo.

## Stack

- `frontend/`: Next.js + Tailwind chat UI
- `backend/`: Node.js + TypeScript + Fastify + LangGraph.js + Gemini + PostgreSQL

## Product Direction

- real `users` and `companies` tables
- admin-managed agents with structured `agent_info`
- generated and stored `system_prompt` per agent
- direct user assignment and role-based assignment
- per-session employee `user_prompt`
- persist sessions and messages in PostgreSQL
- persist LangGraph thread state in PostgreSQL
- keep the backend modular so it can later integrate into a larger app

## Integration Goal

This project is being designed so it can later attach to a larger existing application.

That means:

- PostgreSQL is the system of record
- agent data should stay logically isolated from unrelated app data
- the backend should later be able to reuse parent-app users, roles, and company context
- the agent module should work either as a standalone service or as part of a bigger Node.js backend

## Schema

The canonical data-model reference is in `SCHEMA.md`.

## Local setup

1. Copy values into `.env` at the repo root.
2. Start the backend:

```bash
cd backend
pnpm install
pnpm dev
```

3. Start the frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

## Environment

Expected root `.env` values:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/humantouch
APP_DB_SCHEMA=humantouch
LANGGRAPH_DB_SCHEMA=langgraph
GEMINI_API_KEY=
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.5-pro
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
DEV_AUTH_USER_EMAIL=admin@humantouch.local
```

## Current Backend Scope

- seeded company + admin user
- one built-in `Admin` agent
- admin-created custom agents
- generated `system_prompt` stored on agents
- role-based and direct user assignment tables
- multiple chat sessions
- PostgreSQL-backed session metadata and message history
- LangGraph.js execution in TypeScript
- SSE streaming from backend to frontend

## Migrations

This repo now has a migration entrypoint:

```bash
cd backend
npm run migrate
```

What "migration" means here:

- a migration is a controlled database change
- instead of manually changing tables in Postgres, the app applies versioned schema updates
- this makes local, staging, and production databases more consistent

Current status:

- the backend still uses idempotent schema bootstrap logic internally
- that bootstrap is now wrapped by a migration bookkeeping table: `humantouch.schema_migrations`
- future schema changes should be added as new migration entries instead of expanding one giant startup function forever

## Dev Auth

For development, backend routes resolve a real user from the `users` table on each request.

Default behavior:

- if `x-dev-user-email` header is present, that user is loaded
- otherwise the backend falls back to `DEV_AUTH_USER_EMAIL`
- if that is unset, it falls back to the seeded admin user

Example:

```bash
curl -H "x-dev-user-email: admin@humantouch.local" http://localhost:3001/api/agents
```

## ORM

This repo does not use an ORM right now.

What an ORM is:

- ORM stands for Object-Relational Mapper
- it lets you work with database rows through code models instead of writing SQL directly
- common examples are Prisma, Drizzle, TypeORM, and Sequelize

Why this repo does not use one yet:

- raw SQL is simpler for the current MVP
- the schema is still changing quickly
- the project wants tight control over PostgreSQL schema layout for future integration

What we use instead:

- `pg` for database access
- explicit SQL queries
- explicit schema bootstrap/migration logic

If the project grows, the most likely ORM/query-builder worth considering later would be:

- Drizzle, if you want typed SQL with low abstraction
- Prisma, if you want a higher-level data model and generated client

## Current Non-Goals

- finished auth UI flows
- multiple model providers
- vector search / RAG
- MCP integrations
- a full employee-facing assignment UI

## Build Principles

- keep v1 small
- avoid coupling tightly to one app-specific schema too early
- separate agent definitions from conversation history
- keep API, persistence, and orchestration layers easy to replace or integrate
