import { END, START, StateGraph } from "@langchain/langgraph";

import { runSelectedAgentNode } from "../nodes/run-selected-agent.node.js";
import { WorkflowAnnotation } from "../state.js";

export function createAdminWorkflow() {
  return new StateGraph(WorkflowAnnotation)
    .addNode("run_selected_agent", runSelectedAgentNode)
    .addEdge(START, "run_selected_agent")
    .addEdge("run_selected_agent", END);
}

export const adminWorkflow = createAdminWorkflow().compile();
