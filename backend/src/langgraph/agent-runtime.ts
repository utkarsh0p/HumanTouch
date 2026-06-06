import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatGoogle } from "@langchain/google/node";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Composio, type Session } from "@composio/core";
import { LangchainProvider } from "@composio/langchain";
import { createAgent } from "langchain";

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
const composioSessionPromises = new Map<
  string,
  Promise<Session<unknown, unknown, LangchainProvider>>
>();

type RuntimeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SelectedAgentStreamEvent =
  | {
      type: "token";
      text: string;
    }
  | {
      type: "final";
      text: string;
    }
  | {
      type: "progress";
      progress: AgentProgressEvent;
    };

export type SelectedAgentRuntimeState = {
  user: AuthenticatedUser;
  session: {
    threadId: string;
    agentId: string;
    userPrompt: string | null;
    systemPromptUsed: string | null;
  };
  agent: AgentRecord;
  input: {
    message: string;
  };
  history: RuntimeMessage[];
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
    where: {
      threadId,
      companyId: user.company_id,
    },
  });
  if (!session) {
    throw new Error("Session not found.");
  }

  const canAccessAgent = await canUserAccessAgent(user, session.agentId);
  if (!canAccessAgent) {
    throw new Error("Agent access denied.");
  }

  const agent = await getAgentById(session.agentId);
  if (!agent || agent.company_id !== user.company_id) {
    throw new Error("Session agent no longer exists.");
  }

  const messages = await prisma.agentMessage.findMany({
    where: {
      threadId,
      role: { in: ["user", "assistant"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      content: true,
    },
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
    history: messages.map((item) => ({
      role: item.role as RuntimeMessage["role"],
      content: item.content,
    })),
  };
}

export function buildRuntimePrompt(state: SelectedAgentRuntimeState): string {
  const promptParts = [
    state.session.systemPromptUsed || state.agent.system_prompt,
    "",
    "Runtime context:",
    `Current date/time: ${getCurrentDateContext()} (Asia/Kolkata).`,
    "Use this runtime date for any question involving today, current date, now, tomorrow, yesterday, latest, or recent information. Do not infer dates from model memory.",
    "Use external tools only when the user explicitly asks for external, account-specific, or live data. For ordinary general-knowledge, identity, or date questions, answer directly from the conversation and runtime context.",
    "If you call a tool, you must continue after the tool result and produce a final text answer for the user.",
  ];

  if (state.session.userPrompt?.trim()) {
    promptParts.push("", "User style preferences:", state.session.userPrompt.trim());
  }

  return promptParts.join("\n");
}

export function createConversationInput(state: SelectedAgentRuntimeState): BaseMessage[] {
  return state.history.map((message) =>
    message.role === "assistant"
      ? new AIMessage(message.content)
      : new HumanMessage(message.content),
  );
}

export async function generateDirectAgentResponse(
  state: SelectedAgentRuntimeState,
): Promise<string> {
  const response = await llm.invoke([
    new SystemMessage(
      [
        buildRuntimePrompt(state),
        "",
        "External tools are unavailable for this retry. Answer directly in text using the conversation history and runtime context.",
      ].join("\n"),
    ),
    ...createConversationInput(state),
  ]);

  return extractText(response.content).trim();
}

function getComposioClient(): Composio<LangchainProvider> | null {
  if (!settings.composioApiKey) {
    return null;
  }

  if (!composioClient) {
    composioClient = new Composio({
      apiKey: settings.composioApiKey,
      provider: new LangchainProvider(),
    });
  }

  return composioClient;
}

async function getComposioSession(
  userId: string,
  toolkits: string[],
): Promise<Session<unknown, unknown, LangchainProvider> | null> {
  const client = getComposioClient();
  if (!client) {
    return null;
  }

  const selectedToolkits = [...toolkits].sort();
  const cacheKey = `${userId}:${selectedToolkits.length > 0 ? selectedToolkits.join(",") : "all"}`;
  let sessionPromise = composioSessionPromises.get(cacheKey);
  if (!sessionPromise) {
    sessionPromise = client.create(userId, {
      ...(selectedToolkits.length > 0 ? { toolkits: selectedToolkits } : {}),
      manageConnections: true,
      workbench: { enable: false },
    });
    composioSessionPromises.set(cacheKey, sessionPromise);
  }

  try {
    return await sessionPromise;
  } catch (error) {
    composioSessionPromises.delete(cacheKey);
    throw error;
  }
}

async function getComposioTools(
  userId: string,
  toolkits: string[],
): Promise<DynamicStructuredTool[]> {
  try {
    const session = await getComposioSession(userId, toolkits);
    if (!session) {
      return [];
    }

    return await session.tools();
  } catch {
    return [];
  }
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
      title: "Load Composio tools",
      description:
        state.agent.agent_info.allowed_toolkits.length > 0
          ? `Restricting tool discovery to ${state.agent.agent_info.allowed_toolkits.join(", ")}.`
          : "Using default Composio meta-tools for runtime discovery.",
      status: "in-progress",
      tools: state.agent.agent_info.allowed_toolkits,
    },
  } satisfies SelectedAgentStreamEvent;

  const tools = await getComposioTools(state.user.id, state.agent.agent_info.allowed_toolkits);
  yield {
    type: "progress",
    progress: {
      id: "load-tools",
      title: "Load Composio tools",
      description:
        tools.length > 0
          ? `Loaded ${tools.length} Composio runtime tools.`
          : "No Composio tools were loaded; continuing without external tools.",
      status: "completed",
      tools: tools.map((tool) => tool.name),
    },
  } satisfies SelectedAgentStreamEvent;

  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: buildRuntimePrompt(state),
    checkpointer,
    name: state.agent.slug,
  });

  const messages = await createAgentInputMessages(state, checkpointer);
  const run = await agent.streamEvents(
    { messages },
    { version: "v3", configurable: { thread_id: state.session.threadId } },
  );

  yield {
    type: "progress",
    progress: {
      id: "generate-response",
      title: "Generate response",
      description: "Running the agent loop and streaming the answer.",
      status: "in-progress",
    },
  } satisfies SelectedAgentStreamEvent;

  let hasToolCalls = false;
  const queue: SelectedAgentStreamEvent[] = [];
  const toolStatusPromises: Promise<void>[] = [];
  let isDone = false;
  let streamError: unknown;
  let wakeQueue: (() => void) | null = null;

  function push(event: SelectedAgentStreamEvent): void {
    queue.push(event);
    wakeQueue?.();
    wakeQueue = null;
  }

  function waitForQueue(): Promise<void> {
    return new Promise((resolve) => {
      wakeQueue = resolve;
    });
  }

  const messageTask = (async () => {
    for await (const message of run.messages) {
      for await (const text of message.text) {
        push({ type: "token", text });
      }
    }
  })();

  const toolTask = (async () => {
    for await (const call of run.toolCalls) {
      hasToolCalls = true;
      const toolId = `tool:${call.callId}`;

      push({
        type: "progress",
        progress: {
          id: "run-tools",
          title: "Run tool calls",
          description: "Executing selected Composio tool calls.",
          status: "in-progress",
        },
      });
      push({
        type: "progress",
        progress: {
          id: toolId,
          parent_id: "run-tools",
          title: call.name,
          description: "Executing tool call.",
          status: "in-progress",
          tools: [call.name],
        },
      });

      const statusPromise = (async () => {
        try {
          const status = await call.status;
          const error = await call.error;
          push({
            type: "progress",
            progress: {
              id: toolId,
              parent_id: "run-tools",
              title: call.name,
              description:
                status === "error"
                  ? error ?? "Tool call failed."
                  : "Tool call completed.",
              status: status === "error" ? "failed" : "completed",
              tools: [call.name],
            },
          });
        } catch (error) {
          push({
            type: "progress",
            progress: {
              id: toolId,
              parent_id: "run-tools",
              title: call.name,
              description: error instanceof Error ? error.message : "Tool call failed.",
              status: "failed",
              tools: [call.name],
            },
          });
        }
      })();

      toolStatusPromises.push(statusPromise);
    }

    await Promise.allSettled(toolStatusPromises);
    if (hasToolCalls) {
      push({
        type: "progress",
        progress: {
          id: "run-tools",
          title: "Run tool calls",
          description: "Completed tool execution.",
          status: "completed",
        },
      });
    }
  })();

  void Promise.all([messageTask, toolTask, run.output])
    .then(([, , output]) => {
      const finalText = extractFinalAssistantText(output);
      if (finalText) {
        push({ type: "final", text: finalText });
      }

      push({
        type: "progress",
        progress: {
          id: "generate-response",
          title: "Generate response",
          description: "Response generation completed.",
          status: "completed",
        },
      });
    })
    .catch((error) => {
      streamError = error;
      push({
        type: "progress",
        progress: {
          id: "generate-response",
          title: "Generate response",
          description: error instanceof Error ? error.message : "Agent run failed.",
          status: "failed",
        },
      });
    })
    .finally(() => {
      isDone = true;
      wakeQueue?.();
      wakeQueue = null;
    });

  while (!isDone || queue.length > 0) {
    const event = queue.shift();
    if (event) {
      yield event;
      continue;
    }

    await waitForQueue();
  }

  if (streamError) {
    throw streamError;
  }
}

export function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function extractFinalAssistantText(output: unknown): string {
  if (!output || typeof output !== "object" || !("messages" in output)) {
    return "";
  }

  const messages = output.messages;
  if (!Array.isArray(messages)) {
    return "";
  }

  const assistantMessage = [...messages].reverse().find(isAssistantMessage);
  if (!assistantMessage || typeof assistantMessage !== "object") {
    return "";
  }

  return "content" in assistantMessage ? extractText(assistantMessage.content).trim() : "";
}

function isAssistantMessage(message: unknown): message is BaseMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message instanceof AIMessage) {
    return true;
  }

  if ("_getType" in message && typeof message._getType === "function") {
    return message._getType() === "ai";
  }

  if ("role" in message && message.role === "assistant") {
    return true;
  }

  return "type" in message && message.type === "ai";
}
