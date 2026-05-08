import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { settings } from "../config.js";
import type { AgentRecord } from "../types/agents.js";

const llm = new ChatGoogle({
  apiKey: settings.googleApiKey,
  model: settings.geminiModel,
  temperature: 0.2,
  maxRetries: 2,
});

let checkpointerPromise: Promise<PostgresSaver> | null = null;

async function getCheckpointer(): Promise<PostgresSaver> {
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

const agentGraphBuilder = new StateGraph(MessagesAnnotation)
  .addNode("agent_executor", async (state) => {
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
  })
  .addEdge(START, "agent_executor")
  .addEdge("agent_executor", END);

let graphPromise:
  | Promise<ReturnType<typeof agentGraphBuilder.compile>>
  | null = null;

export async function getAgentGraph(
  _agent: Pick<AgentRecord, "id" | "system_prompt">,
): Promise<ReturnType<typeof agentGraphBuilder.compile>> {
  if (!graphPromise) {
    graphPromise = (async () => {
      const checkpointer = await getCheckpointer();
      return agentGraphBuilder.compile({ checkpointer });
    })();
  }

  return graphPromise;
}

export function createUserInput(
  message: string,
  context: string,
): { messages: BaseMessage[] } {
  return {
    messages: [new SystemMessage(context), new HumanMessage(message)],
  };
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

        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}
