# HumanTouch

HumanTouch is a company-facing webapp for creating and managing AI agents for employees.

The current backend direction now assumes a real company/user data model: companies, users, admin-managed agents, access assignments, session metadata, and LangGraph-backed chat execution. The architecture is still being shaped so this can later plug into a larger PostgreSQL-based business application instead of remaining a separate silo.

## Stack

- `frontend/`: Next.js + Tailwind chat UI
- `backend/`: Node.js + TypeScript + Fastify + Prisma + LangGraph.js + Gemini + PostgreSQL

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
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3003
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
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

This repo has two migration paths during the Prisma transition.

For HumanTouch product tables, use Prisma:

```bash
cd backend
pnpm exec prisma migrate dev --name your_change_name
```

Prisma migrations:

- use `backend/prisma/schema.prisma` as the app-table source of truth
- write SQL migration files under `backend/prisma/migrations/`
- record applied migration history in `humantouch._prisma_migrations`
- manage HumanTouch product tables, not LangGraph checkpoint tables

The legacy/bootstrap migration entrypoint still exists for compatibility:

```bash
cd backend
npm run migrate
```

Current transition status:

- existing idempotent bootstrap logic is still present so older local databases keep working
- that bootstrap uses `humantouch.schema_migrations`
- new app-table schema changes should prefer Prisma migrations
- LangGraph checkpointer tables remain managed by LangGraph in `LANGGRAPH_DB_SCHEMA`

## Auth

The backend now supports basic local auth with:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Behavior:

- login/signup issue an `HttpOnly` session cookie
- logout clears the cookie and deletes the matching server-side session row
- protected routes read the current user from that cookie

Local seeded admin credentials:

- email: `utkarshsingh@gmail.com`
- password: `utkarshsingh`

For explicit dev impersonation, you can still send `x-dev-user-email` and the backend will load that user from the `users` table for the request.

Example:

```bash
curl -H "x-dev-user-email: utkarshsingh@gmail.com" http://localhost:3001/api/agents
```

## Database Access

HumanTouch product data now uses Prisma for normal CRUD.

Prisma manages the app tables in `APP_DB_SCHEMA`, which defaults to `humantouch`:

- `companies`
- `users`
- `auth_sessions`
- `agents`
- `agent_role_assignments`
- `agent_user_assignments`
- `agent_sessions`
- `agent_messages`

The backend still keeps `pg` for compatibility/bootstrap code and for LangGraph persistence. LangGraph checkpoint tables live in `LANGGRAPH_DB_SCHEMA`, which defaults to `langgraph`, and should not be managed through Prisma migrations.

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
