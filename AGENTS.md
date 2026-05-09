# AGENTS.md

## Project

This project is `HumanTouch`.

It is a company webapp where an admin can create and manage AI agents for employees.

## Product Goal

The near-term goal is to ship a focused MVP for a single company admin.

The longer-term goal is to make this agent system integration-ready so it can attach to a larger existing business application and reuse that application's backend, users, roles, and PostgreSQL data model.

## Canonical Markdown Files

These markdown files are part of the working project context, but they should be pulled in only when the task needs them.

- `AGENTS.md`
  Use for project guardrails, product direction, and repo-specific working rules.
- `README.md`
  Use for local setup, runtime expectations, dev auth notes, migration command notes, and high-level backend/frontend scope.
- `PROJECT_BRIEF.md`
  Use when the task is about product direction, MVP framing, or longer-term integration intent.
- `SCHEMA.md`
  Use when the task touches database design, auth/access modeling, assignments, sessions, or prompt storage.
- `STYLES.md`
  Use only for frontend visual work, typography, Claude-inspired styling, or UI consistency questions.

Do not load all markdown files into context by default. Use only the files relevant to the task at hand.

## Current Product Scope

The current codebase now assumes:

- one seeded demo company
- one seeded admin user
- one built-in `Admin` agent
- admin-created custom agents
- direct user assignment and role-based assignment
- per-session employee `user_prompt`

Admin users can:

- create agents
- edit agents
- assign agents to employees or roles
- access company agent/session data

Normal employees should later:

- log in
- see only assigned agents
- chat with those agents using their own session-level style prompt

## Core Product Model

Version one should support:

- real `companies` and `users` tables
- one default `Admin` agent
- multiple chat sessions/history
- backend-persisted sessions
- agent execution through LangGraph
- future support for custom agents created by admin
- generated/stored `system_prompt` per agent
- per-session employee `user_prompt`

The architecture should remain compatible with later parent-app integration for users, companies, roles, and PostgreSQL reuse.

## Session Model

Each chat is a session with its own `thread_id`.

Requirements:

- users can create multiple sessions
- session history appears in the UI
- session state is restored from the backend
- LangGraph checkpointer is used for persistence
- PostgreSQL is the initial persistence store
- session storage should remain compatible with future foreign keys such as `company_id`, `created_by_user_id`, and `agent_id`

## Agent Model

Current state:

- one default `Admin` agent is seeded
- admin can create additional agents
- each agent stores structured `agent_info`
- each agent stores a generated `system_prompt`
- access is granted through:
  - role assignments
  - direct user assignments

Future state:

- employees only see agents assigned to them
- agent prompt generation can become more sophisticated without changing the runtime model
- auth/login can move from dev auth to full production auth
- the built-in `Admin` agent may later act as a coordinator that assigns work to other company agents, gathers their outputs, and returns a consolidated result to the human admin

Design the data model so agent definitions remain separate from conversation history.

Future orchestration direction:

- keep human-to-agent chat as the initial UX
- later support admin-to-admin-agent orchestration across multiple subordinate agents
- treat delegated multi-agent work as a separate orchestration or run model, not as a replacement for normal chat sessions
- keep permissions explicit so the coordinating `Admin` agent can only delegate within the company's allowed agent set
- preserve a clean separation between agent definitions, conversation history, and future delegated work execution records

## Expected UX

Keep the first UI simple:

- sidebar for sessions
- main chat area
- current agent indicator
- room for future execution/progress state

## Architecture Direction

- frontend: Next.js + Tailwind CSS
- backend: Node.js + TypeScript
- backend framework: Fastify
- orchestration: LangGraph.js
- model provider: Google Gemini via environment variable
- persistence: PostgreSQL
- repo layout: `frontend/` and `backend/`

Integration direction:

- build the backend so it can run either as a standalone service or be mounted into a larger Node.js backend
- keep agent tables logically isolated, ideally in a dedicated PostgreSQL schema
- avoid creating a separate source of truth for users, employees, companies, or roles

## MVP Backend Direction

For the MVP, keep the backend as a single Node.js service.

- use Fastify for all backend APIs, not only LangGraph routes
- keep LangGraph execution inside the same TypeScript backend
- do not introduce a split backend architecture
- use Server-Sent Events (SSE) for response streaming
- use PostgreSQL for chat sessions/history and LangGraph checkpoint persistence
- prefer a service/module structure that can later be reused inside a larger backend
- keep route contracts stable and simple
- keep auth and authorization separated
- keep company scoping explicit in backend queries
- use request user context consistently

## Current Non-Goals

Do not add these in the initial MVP unless explicitly requested:

- `shadcn/ui`
- multi-provider model abstraction
- MCP integrations
- vector search / RAG
- additional built-in agents beyond `admin`
- full multi-agent delegation workflows in the first release

Also avoid these unless explicitly requested:

- deep coupling to one company's existing proprietary schema before the integration shape is known
- background job systems
- websocket infrastructure when SSE is sufficient
- premature multi-tenant abstractions in the UI

## Guardrails

- no sensitive external action without approval
- strict role-based access control
- keep v1 small and extensible
- design for future multi-agent expansion, but do not build all agents now
- keep backend logic integration-friendly for a larger PostgreSQL-based app
- avoid MongoDB-specific assumptions anywhere in the code or data model
- prefer clear interfaces between API, persistence, and agent orchestration layers

## Immediate Build Assumption

Unless changed, build around this assumption:

- single-company MVP
- CEO is the admin
- seeded admin user exists in the database
- one default `Admin` agent exists
- Google Gemini is the only model provider for now
- admin will later create and assign more agents
- sessions and history are first-class features
- PostgreSQL is the system of record
- the architecture should be ready to later reuse parent-app users, roles, and company data
- a later phase may allow the `Admin` agent to break work into sub-tasks for other agents and collect the results centrally
