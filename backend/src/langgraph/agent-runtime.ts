import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogle } from "@langchain/google/node";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Composio } from "@composio/core";
import { LangchainProvider } from "@composio/langchain";

import { settings } from "../config.js";
import { prisma } from "../db/prisma.js";
import { canUserAccessAgent } from "../services/access.js";
import { getAgentById } from "../services/agents.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type { AgentRecord } from "../types/agents.js";
import type { AgentProgressEvent } from "../types/chat.js";

const llm = new ChatGoogle({
  apiKey: settings.googleApiKey,
  model: settings.geminiModel,
  temperature: 0.2,
  maxRetries: 2,
});

let checkpointerPromise: Promise<PostgresSaver> | null = null;
let composioClient: Composio<LangchainProvider> | null = null;

export type SelectedAgentStreamEvent =
  | { type: "token"; text: string }
  | { type: "final"; text: string }
  | { type: "progress"; progress: AgentProgressEvent };

export type SelectedAgentRuntimeState = {
  user: AuthenticatedUser;
  session: {
    threadId: string;
    agentId: string;
    userPrompt: string | null;
    systemPromptUsed: string | null;
  };
  agent: AgentRecord;
  input: { message: string };
  history: RuntimeMessage[];
};

type RuntimeMessage = {
  role: "user" | "assistant";
  content: string;
};

function getCurrentDateContext(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  return formatter.format(now);
}

function getComposioClient(): Composio<LangchainProvider> | null {
  if (!settings.composioApiKey) return null;
  if (!composioClient) {
    composioClient = new Composio({
      apiKey: settings.composioApiKey,
      provider: new LangchainProvider(),
    });
  }
  return composioClient;
}

export async function getWorkflowCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointerPromise) {
    checkpointerPromise = (async () => {
      const saver = PostgresSaver.fromConnString(settings.databaseUrl, {
        schema: settings.langgraphSchema,
      });
      await saver.setup();
      return saver;
    })();
  }
  return checkpointerPromise;
}

async function loadComposioTools(
  userId: string,
  toolkits: string[],
): Promise<DynamicStructuredTool[]> {
  const client = getComposioClient();
  if (!client) {
    console.warn("[Composio] COMPOSIO_API_KEY is not configured; external tools are unavailable.");
    return [];
  }

  try {
    const session = await client.create(
      userId,
      toolkits.length > 0 ? { toolkits } : undefined,
    );
    const rawTools = await session.tools();
    const tools = rawTools.filter(
      (t) => (t as { name?: string }).name !== "COMPOSIO_MANAGE_CONNECTIONS",
    );

    const connectTool = new DynamicStructuredTool({
      name: "connect_account",
      description:
        "Initiate an OAuth connection for a toolkit/app. Returns a redirect URL the user must open to authorize. Use this when a tool call fails due to a missing connection or when the user asks to connect an app.",
      schema: z.object({
        toolkit: z
          .string()
          .describe(
            "The toolkit slug to connect, e.g. 'github', 'gmail', 'googlecalendar'",
          ),
      }),
      func: async ({ toolkit }: { toolkit: string }) => {
        try {
          const connectionRequest = await session.authorize(toolkit);
          const redirectUrl = connectionRequest.redirectUrl;
          if (!redirectUrl)
            return `No redirect URL returned for ${toolkit}. The account may already be connected.`;
          return redirectUrl;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Failed to initiate connection for ${toolkit}: ${msg}`;
        }
      },
    });

    return [...tools, connectTool] as DynamicStructuredTool[];
  } catch (error) {
    console.warn("[Composio] Failed to load tools:", error);
    return [];
  }
}

export async function buildSelectedAgentRuntimeState({
  user,
  threadId,
  message,
}: {
  user: AuthenticatedUser;
  threadId: string;
  message: string;
}): Promise<SelectedAgentRuntimeState> {
  const session = await prisma.agentSession.findFirst({
    where: { threadId, companyId: user.company_id },
  });
  if (!session) throw new Error("Session not found.");

  const canAccess = await canUserAccessAgent(user, session.agentId);
  if (!canAccess) throw new Error("Agent access denied.");

  const agent = await getAgentById(session.agentId);
  if (!agent || agent.company_id !== user.company_id) {
    throw new Error("Session agent no longer exists.");
  }

  const messages = await prisma.agentMessage.findMany({
    where: { threadId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  return {
    user,
    session: {
      threadId: session.threadId,
      agentId: session.agentId,
      userPrompt: session.userPrompt,
      systemPromptUsed: session.systemPromptUsed,
    },
    agent,
    input: { message },
    history: messages.map((m) => ({
      role: m.role as RuntimeMessage["role"],
      content: m.content,
    })),
  };
}

export function buildRuntimePrompt(
  state: SelectedAgentRuntimeState,
  hasTools: boolean,
): string {
  const parts = [
    state.session.systemPromptUsed || state.agent.system_prompt,
    "",
    "Runtime context:",
    `Current date/time: ${getCurrentDateContext()} (Asia/Kolkata).`,
    "Use this runtime date for any question involving today, current date, now, tomorrow, yesterday, latest, or recent information.",
  ];

  if (hasTools) {
    parts.push(
      "",
      "You have access to Composio tools. Use them to complete the user's request.",
      "If an app is not connected, use the connect_account tool with the toolkit slug to generate an OAuth link for the user.",
      "If multiple accounts need connecting, list ALL connection links in a single response — one per service — do not ask the user to connect them one at a time.",
    );
  } else {
    parts.push(
      "",
      "You have no external tools available. Do not claim you can perform any external actions.",
    );
  }

  if (state.session.userPrompt?.trim()) {
    parts.push("", "User style preferences:", state.session.userPrompt.trim());
  }

  return parts.join("\n");
}

export function createConversationInput(state: SelectedAgentRuntimeState): BaseMessage[] {
  return state.history.map((m) =>
    m.role === "assistant" ? new AIMessage(m.content) : new HumanMessage(m.content),
  );
}

async function createAgentInputMessages(
  state: SelectedAgentRuntimeState,
  checkpointer: PostgresSaver,
): Promise<BaseMessage[]> {
  const config = { configurable: { thread_id: state.session.threadId } };
  const existingCheckpoint = await checkpointer.getTuple(config).catch(() => undefined);

  if (existingCheckpoint) {
    return [new HumanMessage(state.input.message)];
  }

  return createConversationInput(state);
}

export async function generateDirectAgentResponse(
  state: SelectedAgentRuntimeState,
): Promise<string> {
  const response = await llm.invoke([
    new SystemMessage(
      [
        buildRuntimePrompt(state, false),
        "",
        "Answer directly using the conversation history and runtime context.",
      ].join("\n"),
    ),
    ...createConversationInput(state),
  ]);
  return extractText(response.content).trim();
}

export async function* streamSelectedAgentResponse(state: SelectedAgentRuntimeState) {
  const checkpointer = await getWorkflowCheckpointer();

  yield {
    type: "progress",
    progress: {
      id: "prepare-context",
      title: "Prepare agent context",
      description: `Loaded ${state.agent.name} with session history and access policy.`,
      status: "completed",
    },
  } satisfies SelectedAgentStreamEvent;

  yield {
    type: "progress",
    progress: {
      id: "load-tools",
      title: "Load tools",
      description: "Loading Composio tools.",
      status: "in-progress",
    },
  } satisfies SelectedAgentStreamEvent;

  const toolkits = state.agent.agent_info.allowed_toolkits;
  const tools = await loadComposioTools(state.user.id, toolkits);

  yield {
    type: "progress",
    progress: {
      id: "load-tools",
      title: "Load tools",
      description:
        tools.length > 0
          ? `Loaded ${tools.length} tools.`
          : "No tools loaded; continuing without external tools.",
      status: "completed",
      tools: tools.map((t) => t.name),
    },
  } satisfies SelectedAgentStreamEvent;

  const systemPrompt = buildRuntimePrompt(state, tools.length > 0);
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: checkpointer,
    stateModifier: new SystemMessage(systemPrompt),
  });

  const inputMessages = await createAgentInputMessages(state, checkpointer);

  yield {
    type: "progress",
    progress: {
      id: "generate-response",
      title: "Generate response",
      description: "Running the agent loop.",
      status: "in-progress",
    },
  } satisfies SelectedAgentStreamEvent;

  let finalText = "";
  const activeToolIds = new Set<string>();

  try {
    for await (const event of agent.streamEvents(
      { messages: inputMessages },
      { version: "v2", configurable: { thread_id: state.session.threadId } },
    )) {
      if (event.event === "on_chat_model_stream") {
        const content = extractText(event.data?.chunk?.content);
        if (content) {
          yield { type: "token", text: content } satisfies SelectedAgentStreamEvent;
        }
      } else if (event.event === "on_tool_start") {
        const toolId = `tool:${event.run_id}`;
        activeToolIds.add(toolId);
        yield {
          type: "progress",
          progress: {
            id: toolId,
            parent_id: "run-tools",
            title: event.name,
            description: `Calling ${event.name}.`,
            status: "in-progress",
            tools: [event.name],
          },
        } satisfies SelectedAgentStreamEvent;

        if (activeToolIds.size === 1) {
          yield {
            type: "progress",
            progress: {
              id: "run-tools",
              title: "Run tool calls",
              description: "Executing tool calls.",
              status: "in-progress",
            },
          } satisfies SelectedAgentStreamEvent;
        }
      } else if (event.event === "on_tool_end") {
        const toolId = `tool:${event.run_id}`;
        activeToolIds.delete(toolId);
        yield {
          type: "progress",
          progress: {
            id: toolId,
            parent_id: "run-tools",
            title: event.name,
            description: "Tool call completed.",
            status: "completed",
            tools: [event.name],
          },
        } satisfies SelectedAgentStreamEvent;

        if (activeToolIds.size === 0) {
          yield {
            type: "progress",
            progress: {
              id: "run-tools",
              title: "Run tool calls",
              description: "All tool calls completed.",
              status: "completed",
            },
          } satisfies SelectedAgentStreamEvent;
        }
      } else if (event.event === "on_chain_end") {
        const candidate = extractFinalAssistantText(event.data?.output);
        if (candidate) finalText = candidate;
      }
    }
  } catch (error) {
    yield {
      type: "progress",
      progress: {
        id: "generate-response",
        title: "Generate response",
        description: error instanceof Error ? error.message : "Agent run failed.",
        status: "failed",
      },
    } satisfies SelectedAgentStreamEvent;
    throw error;
  }

  yield {
    type: "progress",
    progress: {
      id: "generate-response",
      title: "Generate response",
      description: "Response generation completed.",
      status: "completed",
    },
  } satisfies SelectedAgentStreamEvent;

  if (finalText) {
    yield { type: "final", text: finalText } satisfies SelectedAgentStreamEvent;
  }
}

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

function extractFinalAssistantText(output: unknown): string {
  if (!output || typeof output !== "object" || !("messages" in output)) return "";

  const messages = output.messages;
  if (!Array.isArray(messages)) return "";

  const assistantMessage = [...messages].reverse().find(isAssistantMessage);
  if (!assistantMessage || typeof assistantMessage !== "object") return "";

  return "content" in assistantMessage ? extractText(assistantMessage.content).trim() : "";
}

function isAssistantMessage(message: unknown): message is BaseMessage {
  if (!message || typeof message !== "object") return false;
  if (message instanceof AIMessage) return true;
  if ("role" in message && message.role === "assistant") return true;
  return "type" in message && message.type === "ai";
}
