# SUPERVISOR_KNOWLEDGE.md

Reference guide for implementing multi-agent orchestration in HumanTouch using the LangGraph Supervisor pattern. The `Admin` agent acts as the supervisor; all other company agents are workers.

---

## 1. Package & Installation

```bash
npm install @langchain/langgraph-supervisor
```

The JS/TS package is `@langchain/langgraph-supervisor`. The original standalone repo (`langchain-ai/langgraph-supervisor-js`) was archived in February 2025 and merged into the LangGraph JS monorepo.

- **Monorepo source:** `github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor`
- **npm:** `https://www.npmjs.com/package/@langchain/langgraph-supervisor`
- **Reference:** `https://reference.langchain.com/javascript/langchain-langgraph-supervisor`

Requires: `@langchain/langgraph`, `@langchain/core` (already in use).

---

## 2. The Supervisor Pattern

**Hub-and-spoke topology.** The supervisor is the single orchestration point — workers never communicate with each other directly. All task delegation and result collection flows through the supervisor.

```
         User
          │
          ▼
      Supervisor (Admin Agent)
      ┌───┼───────────────────┐
      │   │                   │
      ▼   ▼                   ▼
  Agent A  Agent B  ...  Agent N
      │   │                   │
      └───┴───────────────────┘
                  │
              (back to supervisor)
```

**How it works:**
1. User message arrives at supervisor
2. Supervisor LLM reasons about which worker(s) can handle the task
3. Supervisor calls a `transfer_to_<agent_name>` handoff tool → `Command(goto: agentName)`
4. Worker agent runs its full ReAct loop (tools, reasoning, response)
5. Worker returns to supervisor with its output in the message state
6. Supervisor reads the result, decides: delegate more or synthesize and return to user
7. If no handoff tool is called → supervisor responds directly → END

**Why this fits HumanTouch:**
- Admin agent (is_system=true) is the natural supervisor
- Admin-created agents are the workers, loaded dynamically from DB
- Matches the CLAUDE.md architecture direction: "Admin agent as coordinator that assigns work to sub-tasks for other agents and collects results centrally"
- Centralized routing gives excellent debuggability and audit trail

---

## 3. Core API

### `createSupervisor(params)`

Returns a `StateGraph`. Must call `.compile()` before use.

```typescript
import { createSupervisor } from "@langchain/langgraph-supervisor";

const workflow = createSupervisor({ agents, llm, ...options });
const app = workflow.compile({ checkpointer });
```

### All Parameters (`CreateSupervisorParams`)

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `agents` | **YES** | — | Array of compiled `StateGraph` (subagents). Each must have a `name`. |
| `llm` | **YES** | — | LLM instance for supervisor routing decisions. Use temperature 0. |
| `prompt` | No | null | System prompt / routing instructions for the supervisor LLM. Pass admin agent's `system_prompt`. |
| `tools` | No | — | Extra tools for the supervisor itself (beyond handoff tools). |
| `outputMode` | No | `"last_message"` | `"full_history"` appends all worker messages; `"last_message"` appends only the worker's final message. Use `"last_message"` for production. |
| `stateSchema` | No | — | Shared `Annotation.Root` for custom state fields passed between supervisor and workers. |
| `contextSchema` | No | — | Schema for a workflow context object (separate from message state). |
| `responseFormat` | No | — | Zod schema for typed structured final output → available as `state.structuredResponse`. |
| `addHandoffBackMessages` | No | — | When `true`, adds an AIMessage+ToolMessage pair to the history when a worker returns to the supervisor, making the handoff visible in the conversation. |
| `includeAgentName` | No | undefined | `"inline"` injects agent name as XML tags into message content. **Use `"inline"` for Gemini** (see section 6). |
| `supervisorName` | No | `"supervisor"` | Node name for the supervisor in the compiled graph. |
| `preModelHook` | No | — | Node inserted before the supervisor LLM call. Use for message trimming or summarization. |
| `postModelHook` | No | — | Node inserted after the supervisor LLM call. Use for guardrails or human-in-the-loop. |

### `createReactAgent` (subagent creation)

Already used in HumanTouch (`agent-runtime.ts`). For supervisor mode, the `name` field is **required**:

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const workerAgent = createReactAgent({
  llm,
  tools,
  name: agent.slug,           // REQUIRED — supervisor routes by this name
  prompt: agent.system_prompt,
  checkpointSaver: checkpointer, // optional for workers; supervisor handles state
  stateSchema: SharedAnnotation, // only if using shared custom state
});
```

The supervisor auto-generates a `transfer_to_<name>` handoff tool for each agent. If `name` is missing, routing breaks silently.

---

## 4. Handoff Mechanism (How Routing Works)

The supervisor package auto-generates one tool per worker:

```
transfer_to_sales_agent    — routes to agent with name "sales_agent"
transfer_to_research_agent — routes to agent with name "research_agent"
```

**Full handoff cycle:**

```
Supervisor LLM
  └── calls transfer_to_research_agent({ task: "..." })
        └── Command({ goto: "research_agent", update: { messages: [...] } })
              └── research_agent runs (ReAct loop, tool calls, etc.)
                    └── returns to supervisor node
                          └── Supervisor LLM reads new messages
                                ├── calls transfer_to_sales_agent → (repeat)
                                └── responds without handoff → END
```

**`addHandoffBackMessages: true`** inserts an AIMessage (`"Transferring back to supervisor"`) + ToolMessage into the thread when the worker returns. Makes handoffs visible in conversation history — useful for admin audit trails.

---

## 5. Shared State Between Agents

Use `Annotation.Root` to pass typed data between supervisor and workers:

```typescript
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

const SharedAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // Custom fields workers can write and supervisor can read
  researchResults: Annotation<string[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
});

// Pass to BOTH workers AND supervisor
const workerAgent = createReactAgent({
  ...,
  stateSchema: SharedAnnotation,
  prompt: (state) => `Research results so far: ${state.researchResults.join("\n")}`,
});

const workflow = createSupervisor({
  agents: [workerAgent],
  llm,
  stateSchema: SharedAnnotation,
});
```

Only use shared state if workers need to read each other's typed outputs. For most HumanTouch cases, the standard `messages` array (which `outputMode: "last_message"` handles) is sufficient.

---

## 6. HumanTouch-Specific Integration Notes

### Critical: Gemini Compatibility

**Always use `includeAgentName: "inline"`.**

Gemini does not support the OpenAI `name` attribute on `AIMessage`. Without `"inline"` mode, the supervisor cannot distinguish which agent produced which message, breaking routing. Inline mode injects agent names as XML tags into message content, which works with any LLM provider.

```typescript
createSupervisor({
  ...,
  includeAgentName: "inline",  // REQUIRED for Gemini
});
```

### Checkpointer

Reuse the existing `getWorkflowCheckpointer()` from `backend/src/langgraph/agent-runtime.ts`. It returns a `PostgresSaver` backed by the `langgraph` schema. Do not create a new checkpointer instance.

```typescript
const app = workflow.compile({
  checkpointer: await getWorkflowCheckpointer(),
});
```

The supervisor thread uses the same `thread_id` model as existing `AgentSession` records. A supervisor session is stored as a normal `AgentSession` with `agent_id = admin_agent_id`.

### Composio Tools for Workers

Each worker gets its own Composio session. Call `loadComposioTools` per worker, per request. No caching.

```typescript
const tools = await loadComposioTools(userId, agent.agent_info.allowed_toolkits);
```

The supervisor itself can be given a tool set too (e.g., `connect_account`, meta-tools), or left with only the auto-generated handoff tools.

### Loading Agents Dynamically

Workers come from the DB, not hardcoded. At runtime:

1. Call `listAgents()` to get all non-archived company agents
2. Filter out the Admin agent (`is_system === true`) — that's the supervisor
3. The remaining agents are the workers
4. Access control: use `getAccessibleAgents(user)` to respect role/user assignments

```typescript
const allAgents = await listAgents();
const adminAgent = allAgents.find(a => a.is_system);
const workerAgents = allAgents.filter(a => !a.is_system && !a.archived_at);
```

### Recursion Limit

Default is 25 steps. Increase for complex multi-agent chains:

```typescript
app.streamEvents(
  { messages: inputMessages },
  {
    version: "v2",
    configurable: { thread_id: session.threadId },
    recursionLimit: 50,   // increase from default 25
  }
)
```

### Supervisor LLM Temperature

Use `temperature: 0` for the supervisor (deterministic routing). Workers can use the default `temperature: 0.2` already set in `agent-runtime.ts`.

---

## 7. Minimal Working Example (TypeScript, Gemini, PostgreSQL)

This pattern slots into `agent-runtime.ts` alongside the existing `streamSelectedAgentResponse`:

```typescript
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGoogle } from "@langchain/google-genai";
import { SystemMessage } from "@langchain/core/messages";
import { listAgents } from "../services/agents";
import { loadComposioTools, getWorkflowCheckpointer, buildRuntimePrompt } from "./agent-runtime";

export async function* streamSupervisorResponse(
  state: SelectedAgentRuntimeState
): AsyncGenerator<SelectedAgentStreamEvent> {
  const { user, session, agent: adminAgent, input, history } = state;

  // Load all company agents
  const allAgents = await listAgents();
  const workerDefs = allAgents.filter(a => !a.is_system && !a.archived_at);

  const supervisorLlm = new ChatGoogle({
    apiKey: settings.googleApiKey,
    model: settings.geminiModel,
    temperature: 0,            // deterministic routing
    maxRetries: 2,
  });

  // Build compiled worker agents
  const workers = await Promise.all(
    workerDefs.map(async (agentDef) => {
      const tools = await loadComposioTools(user.id, agentDef.agent_info.allowed_toolkits);
      return createReactAgent({
        llm: new ChatGoogle({
          apiKey: settings.googleApiKey,
          model: settings.geminiModel,
          temperature: 0.2,
          maxRetries: 2,
        }),
        tools,
        name: agentDef.slug,          // supervisor routes by slug
        prompt: new SystemMessage(agentDef.system_prompt ?? ""),
      });
    })
  );

  const supervisorSystemPrompt = buildRuntimePrompt(adminAgent, session);

  const workflow = createSupervisor({
    agents: workers,
    llm: supervisorLlm,
    prompt: supervisorSystemPrompt,
    outputMode: "last_message",
    includeAgentName: "inline",       // required for Gemini
    addHandoffBackMessages: true,     // makes delegation visible in history
  });

  const app = workflow.compile({
    checkpointer: await getWorkflowCheckpointer(),
  });

  const inputMessages = createConversationInput(history, input.message);

  // Stream events — same handling as streamSelectedAgentResponse
  for await (const event of app.streamEvents(
    { messages: inputMessages },
    {
      version: "v2",
      configurable: { thread_id: session.threadId },
      recursionLimit: 50,
    }
  )) {
    // Handle token, progress, final events here
    // (same pattern as existing streamSelectedAgentResponse)
  }
}
```

---

## 8. Supervisor vs Swarm

| Factor | Supervisor | Swarm |
|--------|-----------|-------|
| Routing control | Centralized (Admin LLM) | Decentralized (agents hand off directly) |
| Typical latency (multi-domain) | ~9s | ~5s |
| Routing accuracy | ~94% | ~91% |
| Debuggability | Excellent (one audit trail) | Good |
| Loop prevention | Easy (supervisor decides END) | Needs handoff count limits |
| Overlapping agent domains | Handles well | Can loop |
| Best for HumanTouch | **YES** | No |

**Verdict:** Supervisor is correct for HumanTouch. The Admin agent is the natural hub. Company agents have overlapping tool domains (e.g., two agents might both have Gmail access). Centralized routing prevents loops and matches the explicit CLAUDE.md design intent.

---

## 9. Implementation Checklist

When building the supervisor orchestration layer:

- [ ] `npm install @langchain/langgraph-supervisor` in `backend/`
- [ ] New function `streamSupervisorResponse()` — either in `agent-runtime.ts` or a new `backend/src/langgraph/supervisor-runtime.ts`
- [ ] Trigger condition: user is admin AND session agent is the Admin agent AND `workerDefs.length > 0` → use supervisor mode; otherwise fall back to single-agent `streamSelectedAgentResponse`
- [ ] OR: add `orchestrate: boolean` flag to session creation payload for explicit opt-in
- [ ] Access control: only admins can trigger supervisor mode (enforce in `chat.ts` or `access.ts`)
- [ ] Every worker `createReactAgent` call must pass `name: agent.slug`
- [ ] Always pass `includeAgentName: "inline"` to `createSupervisor`
- [ ] Reuse `getWorkflowCheckpointer()` — do not instantiate a new `PostgresSaver`
- [ ] Reuse existing SSE streaming event format (`token`, `progress`, `final`, `done`, `error`)
- [ ] Set `recursionLimit: 50` in `streamEvents` config
- [ ] Supervisor LLM at `temperature: 0`; workers at `temperature: 0.2`
- [ ] `agent_messages` stores the top-level supervisor↔user conversation only
- [ ] Worker sub-invocations do not need their own `AgentSession` rows initially

---

## 10. Key Files to Modify When Implementing

| File | Change |
|------|--------|
| `backend/package.json` | Add `@langchain/langgraph-supervisor` dependency |
| `backend/src/langgraph/agent-runtime.ts` | Add `streamSupervisorResponse()` or create `supervisor-runtime.ts` |
| `backend/src/routes/chat.ts` | Add branch: if supervisor mode → call `streamSupervisorResponse` |
| `backend/src/services/access.ts` | Add `canUseSupervisorMode(user)` guard (admin only) |
| `backend/src/services/agents.ts` | Already has `listAgents()` — no change needed |
| `backend/prisma/schema.prisma` | No changes needed for v1 (reuse AgentSession) |

---

## Sources

- [@langchain/langgraph-supervisor npm](https://www.npmjs.com/package/@langchain/langgraph-supervisor)
- [LangGraph.js supervisor reference](https://reference.langchain.com/javascript/langchain-langgraph-supervisor)
- [createSupervisor function reference](https://reference.langchain.com/javascript/functions/_langchain_langgraph-supervisor.createSupervisor.html)
- [langgraphjs monorepo — langgraph-supervisor](https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor)
- [Supervisor vs Swarm tradeoffs](https://dev.to/focused_dot_io/multi-agent-orchestration-in-langgraph-supervisor-vs-swarm-tradeoffs-and-architecture-1b7e)
- [Python create_supervisor reference](https://reference.langchain.com/python/langgraph-supervisor/supervisor/create_supervisor)
- [How agent handoffs work](https://towardsdatascience.com/how-agent-handoffs-work-in-multi-agent-systems/)
