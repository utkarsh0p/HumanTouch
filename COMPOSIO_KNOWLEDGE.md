# Composio Knowledge

Source: https://docs.composio.dev

---

## What is Composio?

Composio is a framework that lets AI agents discover, authenticate, and execute tools at runtime through a managed session system. It abstracts tool management away from the model context — agents don't need all 500+ tool schemas preloaded; they discover and call them as needed.

---

## Core Pattern (Python)

```python
from composio import Composio
from composio_langgraph import LanggraphProvider
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

composio = Composio(provider=LanggraphProvider())
llm = ChatOpenAI(model="gpt-4o")

session = composio.create(user_id="user_123")
tools = session.tools()

agent = create_agent(tools=tools, model=llm)
result = agent.invoke({"messages": [("user", "Send an email to john@example.com")]})
print(result["messages"][-1].content)
```

## Core Pattern (TypeScript — used in this project)

```typescript
import { Composio } from "@composio/core";
import { LangchainProvider } from "@composio/langchain";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LangchainProvider(),
});

const session = await composio.create("user_123");
const tools = await session.tools();
// Pass tools to your LangGraph / LangChain agent
```

---

## Sessions

A **session** is the runtime context for one user's agent interaction. It handles:

- **User isolation** — tools execute under that user's connected accounts
- **Tool access** — either native tools or MCP URLs
- **Authentication management** — OAuth flows, token refresh, account selection
- **Persistent state** — workbench files, logs, tool memory across turns

### Creating a session

```python
# Python
session = composio.create(user_id="user_123")

# TypeScript
const session = await composio.create("user_123");
```

### Reusing a session across turns

```python
# New task → fresh session
session = composio.create(user_id="user_123")

# Same conversation → reuse by session_id (preserves context)
session = composio.use(session_id="ses_abc123")

# Update settings without recreating
session.update(...)
```

### user_id best practices

| ✅ Good | ❌ Bad |
|---|---|
| Database UUID / primary key | Email (changes over time) |
| Unique username | `"default"` in production (security risk) |

---

## Getting Tools from a Session

```python
# Native tools — formatted for your LLM provider automatically
tools = session.tools()

# MCP URL — for any MCP-compatible client
mcp_url = session.mcp.url
mcp_headers = session.mcp.headers
```

---

## Configuring Sessions

### Restrict to specific toolkits

```python
# Python
session = composio.create(
    user_id="user_123",
    toolkits=["github", "gmail", "slack"]
)

# TypeScript
const session = await composio.create("user_123", {
  toolkits: ["github", "gmail", "slack"]
});
```

### Exclude specific toolkits (allow all others)

```python
session = composio.create(
    user_id="user_123",
    toolkits={"disable": ["linear", "jira"]}
)
```

```typescript
const session = await composio.create("user_123", {
  toolkits: { disable: ["linear", "jira"] }
});
```

### Preload specific tools (skip discovery overhead)

```python
session = composio.create(
    user_id="user_123",
    preload={"tools": ["GMAIL_FETCH_EMAILS", "GMAIL_CREATE_EMAIL_DRAFT"]}
)
```

### Direct tools preset (preload all, disable meta tools)

```typescript
const session = await composio.create("user_123", {
  toolkits: ["GMAIL", "GITHUB"],
  sessionPreset: "direct_tools",
  preload: { tools: "all" },
});
```

### Select which connected account to use (multi-account users)

```python
session = composio.create(
    user_id="user_123",
    connected_accounts={"gmail": ["ca_work_gmail"], "github": ["ca_personal_github"]}
)
```

### Use your own OAuth credentials (not Composio managed)

```python
session = composio.create(
    user_id="user_123",
    auth_configs={"github": "ac_your_github_config"}
)
```

**Auth precedence order:**
1. `connectedAccounts` override
2. `authConfigs` override
3. Previously-created auth config
4. Composio managed auth (default)

---

## Enabling / Disabling Toolkits

### Enable specific toolkits only

```python
session = composio.create(user_id="user_123", toolkits=["github", "gmail"])
```

### Disable specific toolkits

```python
session = composio.create(user_id="user_123", toolkits={"disable": ["exa", "firecrawl"]})
```

### Tool-level control (within a toolkit)

```python
# Enable only specific tools inside a toolkit
session = composio.create(
    user_id="user_123",
    tools={
        "gmail": ["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS"],
        "github": {"enable": ["GITHUB_CREATE_ISSUE"]}
    }
)

# Disable specific tools inside a toolkit
session = composio.create(
    user_id="user_123",
    tools={"slack": {"disable": ["SLACK_DELETE_MESSAGE"]}}
)
```

### Tag-based filtering

Four behavior tags: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`

```python
# Global: only read-only + idempotent tools
session = composio.create(
    user_id="user_123",
    tags=["readOnlyHint", "idempotentHint"]
)

# Per-toolkit override
session = composio.create(
    user_id="user_123",
    tags=["readOnlyHint"],
    tools={"github": {"tags": {"disable": ["destructiveHint"]}}}
)
```

---

## Fetching Tools and Toolkits

### Session-based (recommended)

```python
session.toolkits()        # enabled toolkits with connection status
session.tools()           # meta tools formatted for your LLM provider
session.mcp.url           # MCP endpoint
```

### Catalog browsing (no session needed)

```python
composio.toolkits.get()                        # all available toolkits
composio.tools.get(user_id, toolkits=[...])    # tools within specific toolkits
composio.tools.getRawComposioToolBySlug("TOOL_NAME")  # inspect tool schema
```

### Pagination

```python
all_toolkits = []
cursor = None
while True:
    result = session.toolkits(limit=20, next_cursor=cursor)
    all_toolkits.extend(result.items)
    cursor = result.next_cursor
    if not cursor:
        break
```

### Filters

- `is_connected=True` — only connected toolkits
- `limit=20` — results per page
- `next_cursor` — pagination cursor

---

## Meta Tools (Agent-Driven Discovery)

By default, sessions expose **meta tools** that let the agent discover and call tools at runtime without preloading schemas:

| Tool | Purpose |
|---|---|
| `COMPOSIO_SEARCH_TOOLS` | Discover relevant tools across 500+ apps |
| `COMPOSIO_GET_TOOL_SCHEMAS` | Get input schemas for specific tools |
| `COMPOSIO_MULTI_EXECUTE_TOOL` | Execute up to 50 tools in parallel |
| `COMPOSIO_MANAGE_CONNECTIONS` | Handle OAuth / API key authentication |
| `COMPOSIO_REMOTE_WORKBENCH` | Run Python in a persistent sandbox |
| `COMPOSIO_REMOTE_BASH_TOOL` | Execute bash for data processing |

---

## Authentication: OAuth and API Key Flows

### Programmatic OAuth trigger

```python
connection_request = session.authorize("github")
redirect_url = connection_request.redirect_url          # send user here
connected_account = connection_request.wait_for_connection()  # block until done
```

### API-key toolkits (like Tavily)

Create a shared auth config once, then initiate a connection per user:

```typescript
// Create auth config once
const authConfig = await client.authConfigs.create("TAVILY", {
  type: "use_custom_auth",
  authScheme: "API_KEY",
  credentials: { api_key: process.env.TAVILY_API_KEY },
});

// Initiate connection for user
await client.connectedAccounts.initiate(userId, authConfig.id, {
  config: { authScheme: "API_KEY", val: { generic_api_key: process.env.TAVILY_API_KEY } },
});

// Pass authConfigs when creating session
const session = await client.create(userId, {
  toolkits: ["TAVILY"],
  authConfigs: { TAVILY: authConfig.id },
});
```

---

## Workbench (Sandbox)

Sessions include a persistent Python sandbox by default.

```python
# Disable workbench
session = composio.create(user_id="user_123", workbench={"enable": False})

# Choose compute tier
session = composio.create(user_id="user_123", workbench={"sandbox_size": "large"})
```

| Tier | vCPU | RAM |
|---|---|---|
| `standard` | 1 | 1 GB |
| `medium` | 2 | 2 GB |
| `large` | 4 | 4 GB |
| `xlarge` | 8 | 8 GB |

Persistent files live at `/mnt/files/` and survive sandbox recreation.

---

## Tool Naming Convention

```
{TOOLKIT}_{ACTION}
```

Examples: `GITHUB_CREATE_ISSUE`, `GMAIL_SEND_EMAIL`, `SLACK_POST_MESSAGE`

---

## Minimum SDK Versions

| SDK | Min version for preload |
|---|---|
| `@composio/core` (TypeScript) | ≥ 0.9.0 |
| `composio` (Python) | ≥ 0.13.0 |

---

## How This Project Uses Composio

File: `backend/src/langgraph/agent-runtime.ts`

```typescript
// 1. One shared Composio client (LangchainProvider for LangGraph)
const composio = new Composio({
  apiKey: settings.composioApiKey,
  provider: new LangchainProvider(),
});

// 2. Per-user session scoped to the agent's allowed toolkits
const session = await composio.create(userId, {
  toolkits: allowedToolkits,       // from agent_info.allowed_toolkits
  sessionPreset: "direct_tools",   // preload all, skip meta tools
  preload: { tools: "all" },
  authConfigs: { TAVILY: tavilyAuthConfigId }, // API-key toolkit
});

// 3. Get tools formatted for LangChain, sanitize for Gemini schema compat
const tools = await session.tools();
const sanitizedTools = sanitizeToolsForGemini(tools);

// 4. Pass to LangGraph createAgent
const agent = createAgent({ model: llm, tools: sanitizedTools, ... });
```

Sessions are cached per `userId:toolkits` key to avoid re-creating them on every request.
