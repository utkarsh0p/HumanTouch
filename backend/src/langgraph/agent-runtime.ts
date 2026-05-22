import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ChatGoogle } from "@langchain/google/node";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";

import { settings } from "../config.js";
import { hasConfiguredTool, resolveToolsForAgent } from "./tools/registry.js";
import type { WorkflowState } from "./state.js";

const llm = new ChatGoogle({
  apiKey: settings.googleApiKey,
  model: settings.geminiModel,
  temperature: 0.2,
  maxRetries: 2,
});

let checkpointerPromise: Promise<PostgresSaver> | null = null;

function createToolCallingWorkflow(tools: StructuredToolInterface[]) {
  const llmWithTools = llm.bindTools(tools);

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", async (state: typeof MessagesAnnotation.State) => {
      const response = await llmWithTools.invoke(state.messages);
      return { messages: [response] };
    })
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, ["tools", END])
    .addEdge("tools", "agent")
    .compile();
}

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

export function buildRuntimePrompt(state: WorkflowState): string {
  const promptParts = [
    state.session.systemPromptUsed || state.agent.systemPrompt,
    "",
    "Runtime context:",
    `Current date/time: ${getCurrentDateContext()} (Asia/Kolkata).`,
    "Use this runtime date for any question involving today, current date, now, tomorrow, yesterday, latest, or recent information. Do not infer dates from model memory.",
  ];

  if (hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "web_search")) {
    promptParts.push(
      "",
      "Internet access:",
      "Use the web_search tool when the user asks for research, current information, external facts, sources, companies, people, products, weather, or anything that may have changed recently.",
      "For weather/current/latest/research questions, do not answer from memory. Use web_search first, then answer with the current date and cite source URLs from search results.",
    );
  }

  if (hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "gmail_create_draft")) {
    promptParts.push(
      "",
      "Gmail access:",
      "Use gmail_create_draft to prepare emails for the current user's connected Gmail account.",
      "Do not claim an email was sent after creating a draft. Return the draft ID and a concise recipient/subject preview.",
      "When gmail_create_draft returns a draftId, always include the exact draftId in your assistant response.",
    );
  }

  if (hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "gmail_send_draft")) {
    promptParts.push(
      "Use gmail_send_draft only with an existing draft ID. Do not attempt to send raw email content directly.",
      "If the user says to send it, send this draft, or send the drafted email, use the most recent draftId visible in the conversation or tool result instead of asking again.",
    );
  }

  if (
    hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "gmail_search_messages") ||
    hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "gmail_read_message")
  ) {
    promptParts.push(
      "Use Gmail read/search tools only for messages relevant to the user's request. Prefer searching first, then reading a selected message ID.",
    );
  }

  if (
    hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "github_list_repos") ||
    hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "github_get_repo") ||
    hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "github_search_issues")
  ) {
    promptParts.push(
      "",
      "GitHub access:",
      "Use GitHub read tools to inspect repositories and issues visible to the current user's connected GitHub account.",
      "Search existing issues before suggesting that a new issue should be created.",
    );
  }

  if (hasConfiguredTool(state.agent.agentInfo.allowed_tool_ids, "github_create_issue")) {
    promptParts.push(
      "Use github_create_issue only when the user explicitly asks to create, open, or file a GitHub issue.",
      "After creating an issue, include the issue number and URL from the tool result.",
    );
  }

  if (state.session.userPrompt?.trim()) {
    promptParts.push("", "User style preferences:", state.session.userPrompt.trim());
  }

  return promptParts.join("\n");
}

export function createConversationInput(state: WorkflowState): BaseMessage[] {
  return [
    new SystemMessage(buildRuntimePrompt(state)),
    ...state.history.map((message) =>
      message.role === "assistant"
        ? new AIMessage(message.content)
        : new HumanMessage(message.content),
    ),
  ];
}

export async function invokeSelectedAgent(state: WorkflowState): Promise<string> {
  const tools = resolveToolsForAgent(state.agent.agentInfo.allowed_tool_ids, state);

  if (tools.length > 0) {
    const toolCallingWorkflow = createToolCallingWorkflow(tools);
    const result = await toolCallingWorkflow.invoke(
      { messages: createConversationInput(state) },
      {
        configurable: {
          thread_id: `${state.session.threadId}:tools`,
        },
      },
    );
    const finalMessage = result.messages.at(-1);
    return extractText(finalMessage?.content).trim();
  }

  const response = await llm.invoke(createConversationInput(state));
  return extractText(response.content).trim();
}

export async function streamSelectedAgentResponse(state: WorkflowState) {
  const tools = resolveToolsForAgent(state.agent.agentInfo.allowed_tool_ids, state);

  if (tools.length > 0) {
    const toolCallingWorkflow = createToolCallingWorkflow(tools);
    const result = await toolCallingWorkflow.invoke(
      { messages: createConversationInput(state) },
      {
        configurable: {
          thread_id: `${state.session.threadId}:tools`,
        },
      },
    );
    const finalMessage = result.messages.at(-1);
    return singleMessageStream(finalMessage ?? new AIMessage(""));
  }

  return await llm.stream(createConversationInput(state));
}

async function* singleMessageStream(message: BaseMessage): AsyncGenerator<BaseMessage> {
  yield message;
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
