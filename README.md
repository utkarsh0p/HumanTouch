# HumanTouch

HumanTouch is an admin-facing webapp for creating and managing AI agents for employees.

The current MVP is intentionally small: one built-in `admin` agent, multiple chat sessions, backend-persisted history, and LangGraph.js execution. The architecture is being shaped so this can later plug into a larger PostgreSQL-based business application instead of remaining a totally separate system.

## Stack

- `frontend/`: Next.js + Tailwind chat UI
- `backend/`: Node.js + TypeScript + Fastify + LangGraph.js + Gemini + PostgreSQL

## Product Direction

- start with a single implicit admin user
- provide one built-in `admin` agent first
- persist sessions and messages in PostgreSQL
- persist LangGraph thread state in PostgreSQL
- keep the backend modular so it can later integrate into a larger app
- plan for future custom agents, employee assignment, and role-based access

## Integration Goal

This project is being designed so it can later attach to a larger existing application.

That means:

- PostgreSQL is the system of record
- agent data should stay logically isolated from unrelated app data
- the backend should later be able to reuse parent-app users, roles, and company context
- the agent module should work either as a standalone service or as part of a bigger Node.js backend

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
```

## MVP Scope

- single implicit admin user
- one built-in `admin` agent
- multiple chat sessions
- PostgreSQL-backed session history
- LangGraph.js execution in TypeScript
- SSE streaming from backend to frontend

## Current Non-Goals

- auth and login flows
- multiple model providers
- vector search / RAG
- MCP integrations
- additional built-in agents beyond `admin`

## Build Principles

- keep v1 small
- avoid coupling tightly to one app-specific schema too early
- separate agent definitions from conversation history
- keep API, persistence, and orchestration layers easy to replace or integrate
