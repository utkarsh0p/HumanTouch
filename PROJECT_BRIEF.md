# HumanTouch Project Brief

## Goal

HumanTouch is a company-facing agent management app.

The current goal is to let a company admin manage real agent records, assign access, and chat through persisted sessions while keeping the architecture ready for future employee login and company separation.

The larger goal is to make this system integration-ready so it can be attached to a bigger existing product that already has its own users, roles, company data, and PostgreSQL database.

In a near-future phase, the built-in `Admin` agent should be able to coordinate work across other company agents by assigning sub-tasks, collecting their outputs, and presenting a combined result back to the human admin.

## What The Project Is Approaching

- a modular agent backend in `Node.js` + `TypeScript`
- `Fastify` APIs for session and chat routes
- `LangGraph.js` for agent workflow orchestration
- `LangChain JS` + `Google Gemini` for model calls
- `PostgreSQL` as the system of record
- `SSE` for assistant response streaming
- a frontend that is simple now but leaves room for future multi-agent management
- an orchestration path where the `Admin` agent can later operate as a manager over subordinate agents

## Current Shape

- seeded company and admin user records
- one built-in `Admin` agent
- structured agent definitions compiled into stored `system_prompt`
- role-based and direct user assignment tables
- per-session `user_prompt` support
- multiple backend-persisted chat sessions
- session restore in the UI
- one main LangGraph workflow that routes into admin and employee subgraphs
- backend-built runtime state that selects the active agent dynamically
- future-ready structure for real employee login and multi-company separation

## Near-Future Direction

- keep the current product centered on direct chat and admin management
- keep direct chat on the unified workflow entrypoint
- extend the built-in `Admin` agent into a coordinator for delegated agent work
- allow the admin agent to assign work only to agents inside the same company scope
- keep delegated execution separate from ordinary chat history so future task tracking can evolve cleanly
- preserve strict access control and explicit orchestration boundaries as multi-agent behavior is introduced

## Integration Intent

This should not evolve like an isolated toy chatbot.

It should be built so it can later:

- reuse an existing app's PostgreSQL database
- connect to existing users, employees, companies, and roles
- run as either a standalone agent service or inside a larger Node.js backend
- keep agent-related tables in a dedicated schema or clearly separated module

## Practical Rule For Future Work

When making backend decisions, prefer the version that is easier to embed into a larger PostgreSQL-based business application later.
