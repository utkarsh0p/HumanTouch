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
  const tools = resolveToolsForAgent(state.agent.agentInfo.allowed_tool_ids);

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
  const tools = resolveToolsForAgent(state.agent.agentInfo.allowed_tool_ids);

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
