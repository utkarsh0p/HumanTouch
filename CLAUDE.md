# CLAUDE.md

## Project

This project is `HumanTouch`.

It is a company webapp where an admin can create and manage AI agents for employees.

## Product Goal

HumanTouch is the product: a focused company agent management app for an admin to create, assign, and manage AI agents for employees.

The longer-term goal is to make this agent system integration-ready so it can attach to a larger existing business application and reuse that application's backend, users, roles, and PostgreSQL data model.

## Canonical Markdown Files

These markdown files are part of the working project context, but they should be pulled in only when the task needs them.

- `AGENTS.md`
  Use for project guardrails, product direction, and repo-specific working rules.
- `README.md`
  Use for local setup, runtime expectations, dev auth notes, migration command notes, and high-level backend/frontend scope.
- `PROJECT_BRIEF.md`
  Use when the task is about product direction, current product framing, or longer-term integration intent.
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

The product should support:

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

Current UI is implemented:

- sidebar for sessions and agent selection
- main chat area with markdown rendering
- current agent indicator in header
- **AgentPlan live timeline** — animated step-by-step view of what the agent is doing while running; auto-collapses to a summary when done, user can re-expand
- assistant messages are transparent/full-width, user messages are bubbles

Provider/account UX:

- keep HumanTouch login identity distinct from connected external provider accounts
- show the current HumanTouch user email near provider connection controls
- show each connected provider account as `Connected as <provider email/account id>`
- use an on/off toggle pattern for provider connections:
  - off/not connected starts the provider OAuth connect flow
  - on/connected disconnects the provider and clears stored tokens
- do not imply that the HumanTouch login email must match Google, GitHub, or other provider emails

## Architecture Direction

- frontend: Next.js + Tailwind CSS
- backend: Node.js + TypeScript
- backend framework: Fastify
- ORM for HumanTouch product tables: Prisma
- orchestration: LangGraph.js
- model provider: Google Gemini via environment variable
- persistence: PostgreSQL
- repo layout: `frontend/` and `backend/`

Integration direction:

- build the backend so it can run either as a standalone service or be mounted into a larger Node.js backend
- keep agent tables logically isolated, ideally in a dedicated PostgreSQL schema
- avoid creating a separate source of truth for users, employees, companies, or roles
- keep LangGraph checkpoint tables outside Prisma ownership

## Backend Direction

Keep the backend as a single Node.js service.

- use Fastify for all backend APIs, not only LangGraph routes
- keep LangGraph execution inside the same TypeScript backend
- do not introduce a split backend architecture
- use Server-Sent Events (SSE) for response streaming
- use PostgreSQL for chat sessions/history and LangGraph checkpoint persistence
- use Prisma migrations for HumanTouch product table changes
- prefer a service/module structure that can later be reused inside a larger backend
- keep route contracts stable and simple
- keep auth and authorization separated
- keep company scoping explicit in backend queries
- use request user context consistently
- build LangGraph runtime state in backend services before graph execution
- do NOT manually orchestrate tool calls — let the LLM's ReAct loop decide which tools to use and when
- register tools centrally and bind only each selected agent's allowed tools at runtime

## Tool Integration (Composio + LangGraph)

The official Composio pattern is used — no manual tool orchestration:

```
session = composio.create(userId, { toolkits })   // scoped to agent's allowed_toolkits
tools   = session.tools()                          // returns LangChain-compatible tools
agent   = createReactAgent({ llm, tools, checkpointSaver })
agent.streamEvents(...)                            // LLM decides all tool use
```

Key rules:
- `backend/src/langgraph/agent-runtime.ts` is the single agent execution entry point
- `loadComposioTools(userId, toolkits)` loads tools per request — no caching, no session reuse
- if `allowed_toolkits` is empty on an agent, Composio loads **all** connected toolkits for that user
- Composio meta tools (`COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_SEARCH_TOOLS`) are included automatically — the LLM uses them to connect accounts and find tools
- `COMPOSIO_MULTI_EXECUTE_TOOL` and `COMPOSIO_GET_TOOL_SCHEMAS` are hidden from the UI timeline (internal infrastructure)
- to add a new toolkit: add it to `supportedToolkits` in `services/agents.ts` and `allowedToolkitSchema` in `routes/agents.ts`

## SSE Streaming Protocol

The `/api/chat/stream` endpoint streams these events:

- `token` — partial text chunk to append to the message
- `progress` — agent workflow step update (feeds the AgentPlan timeline)
- `final` — complete final text to replace streamed content (sent when final differs from streamed)
- `done` — stream complete; includes thread_id and title
- `error` — stream failed

Progress events have: `id`, `title`, `status` (`in-progress` / `completed` / `failed`), optional `parent_id` (for tool subtasks under `run-tools`), optional `tools` array.

## Auth and Provider Integrations

Keep app login auth separate from connected-account provider integrations.

- HumanTouch auth identifies the app user and owns workspace access, agent permissions, sessions, and company scoping
- connected-account providers grant external tokens for tools and are owned by the current HumanTouch user
- Google login uses NextAuth in the frontend and only creates/restores the HumanTouch user session
- Google, GitHub, LinkedIn, and Meta in the provider menu are tool integrations, not necessarily login methods
- backend integration OAuth callbacks store encrypted provider tokens in `connected_accounts`
- provider accounts may use different emails/usernames than the HumanTouch user; this is expected and allowed
- frontend integration proxy routes must support both NextAuth users and local `humantouch_session` cookie users
- root `.env` is the source of truth for auth/provider secrets; `frontend/.env.local` should only keep frontend-local values like `NEXT_PUBLIC_API_BASE_URL` and `AUTH_URL`

## Current Non-Goals

Do not add these unless explicitly requested:

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
- enforce tool access in backend code, not only through prompts
- keep v1 small and extensible
- design for future multi-agent expansion, but do not build all agents now
- keep backend logic integration-friendly for a larger PostgreSQL-based app
- avoid MongoDB-specific assumptions anywhere in the code or data model
- prefer clear interfaces between API, persistence, and agent orchestration layers

## Immediate Build Assumption

Unless changed, build around this assumption:

- single-company product
- CEO is the admin
- seeded admin user exists in the database
- one default `Admin` agent exists
- Google Gemini is the only model provider for now
- admin will later create and assign more agents
- sessions and history are first-class features
- PostgreSQL is the system of record
- the architecture should be ready to later reuse parent-app users, roles, and company data
- a later phase may allow the `Admin` agent to break work into sub-tasks for other agents and collect the results centrally
