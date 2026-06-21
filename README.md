# CemberAI

CemberAI is a company-facing webapp for creating and managing AI agents for employees.

The backend uses a real company/user data model: companies, users, admin-managed agents, access assignments, session metadata, and LangGraph ReAct agent execution with checkpoint persistence. The architecture is designed to later plug into a larger PostgreSQL-based business application.

## Stack

- `frontend/`: Next.js + Tailwind chat UI
- `backend/`: Node.js + TypeScript + Fastify + Prisma + LangGraph.js + Composio + Gemini + PostgreSQL

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

1. Copy backend and auth values into `.env` at the repo root.
2. Keep only frontend-local public values in `frontend/.env.local`. The frontend loads root `.env` through `frontend/next.config.ts`.

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

3. Start the backend:

```bash
cd backend
pnpm install
pnpm dev
```

4. Start the frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

## Backend Docker setup

The backend has a Dockerfile for remote deployment. It still listens on port `3001`, the same as local `pnpm dev` or `npm run dev`.

Build the backend image from the repo root:

```bash
docker build -t cemberai-backend ./backend
```

Run it with the root `.env` file:

```bash
docker run --env-file .env -p 3001:3001 cemberai-backend
```

For a remote host, make sure the root `.env` has a database URL the container can reach and an allowed frontend origin:

```bash
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/cemberai
ALLOWED_ORIGINS=http://YOUR_SERVER_IP:3000
```

The backend container initializes the CemberAI schemas and seeded demo data on startup.

## Environment

Expected root `.env` values:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cemberai
APP_DB_SCHEMA=cemberai
LANGGRAPH_DB_SCHEMA=langgraph
GEMINI_API_KEY=
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.5-pro
COMPOSIO_API_KEY=
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3003
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
FRONTEND_BASE_URL=http://localhost:3000
```

## Current Backend Scope

- seeded company + admin user
- two built-in agents: `Admin` (for admins) and `Assistant` (for employees)
- admin-created custom agents
- generated `system_prompt` stored on agents
- role-based and direct user assignment tables
- multiple chat sessions
- PostgreSQL-backed session metadata and message history
- LangGraph ReAct agent runtime with Gemini, Composio tools, and checkpoint persistence
- SSE streaming from backend to frontend

## Agent Runtime

Chat execution uses one selected-agent runner for every CemberAI agent, including the built-in agents and admin-created agents.

Request handling loads the authenticated user, selected session, selected agent, assignment/access result, per-session prompt, and product-readable message history. The backend then creates a LangGraph ReAct agent with the selected agent's system prompt, the Gemini model, Composio tools, and the existing Postgres checkpointer.

Access is enforced before agent execution:

- admins can use any non-archived agent in their company
- employees can use only agents assigned directly to them or to their role
- no chat request may cross the request user's `company_id`

The runtime passes the existing `thread_id` into LangGraph config so checkpointed state remains tied to the CemberAI session. If no checkpoint exists for a thread, the runner restores context from `agent_messages`.

The chat stream emits `token`, `progress`, `done`, and `error` SSE events. `progress` events are transient run UI updates for context preparation, Composio tool loading, tool calls, and response generation; persisted chat history still comes from `agent_messages`.

## Tool Runtime

Composio is the only tool source. Admins can optionally select Gmail and/or GitHub to restrict an agent. If no toolkit is selected, the agent receives Composio's default meta-tools and can discover available toolkits at runtime.

The backend creates or reuses a Composio tool-router session for the current CemberAI user, applies selected toolkit restrictions when present, disables Composio workbench/bash, and passes `session.tools()` into the ReAct agent.

Composio meta-tools provide search, schema lookup, execution, and connection management. If `COMPOSIO_API_KEY` is missing or Composio tool loading fails, chat still runs with `tools: []`.

There is no CemberAI-owned local tool registry and no individual tool-action selection in v1.

## Migrations

This repo has two migration paths during the Prisma transition.

For CemberAI product tables, use Prisma:

```bash
cd backend
pnpm exec prisma migrate dev --name your_change_name
```

Prisma migrations:

- use `backend/prisma/schema.prisma` as the app-table source of truth
- write SQL migration files under `backend/prisma/migrations/`
- record applied migration history in `cemberai._prisma_migrations`
- manage CemberAI product tables, not LangGraph checkpoint tables

The legacy/bootstrap migration entrypoint still exists for compatibility:

```bash
cd backend
npm run migrate
```

Current transition status:

- existing idempotent bootstrap logic is still present so older local databases keep working
- that bootstrap uses `cemberai.schema_migrations`
- new app-table schema changes should prefer Prisma migrations
- LangGraph checkpointer tables remain managed by LangGraph in `LANGGRAPH_DB_SCHEMA`

## Auth

The backend supports local email/password auth with:

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

CemberAI product data uses Prisma for normal CRUD.

Prisma manages the app tables in `APP_DB_SCHEMA`:

- `companies`
- `users`
- `auth_sessions`
- `agents`
- `agent_role_assignments`
- `agent_user_assignments`
- `agent_sessions`
- `agent_messages`

The backend still keeps `pg` for compatibility/bootstrap code and for LangGraph persistence. LangGraph checkpoint tables live in `LANGGRAPH_DB_SCHEMA` and should not be managed through Prisma migrations.

## Current Non-Goals

- multiple model providers
- vector search / RAG
- MCP integrations
- full multi-agent delegation workflows in v1

## Build Principles

- keep v1 small
- avoid coupling tightly to one app-specific schema too early
- separate agent definitions from conversation history
- keep API, persistence, and orchestration layers easy to replace or integrate
