import { END, START, StateGraph } from "@langchain/langgraph";

import { extractText, getWorkflowCheckpointer, streamSelectedAgentResponse } from "./agent-runtime.js";
import { routeUserNode } from "./nodes/route-user.node.js";
import { adminWorkflow } from "./workflows/admin.workflow.js";
import { employeeWorkflow } from "./workflows/employee.workflow.js";
import { WorkflowAnnotation, parseWorkflowState, type WorkflowState } from "./state.js";

function routeWorkflow(state: WorkflowState): "admin_workflow" | "employee_workflow" {
  return routeUserNode(state) === "admin" ? "admin_workflow" : "employee_workflow";
}

const mainWorkflowBuilder = new StateGraph(WorkflowAnnotation)
  .addNode("admin_workflow", adminWorkflow)
  .addNode("employee_workflow", employeeWorkflow)
  .addConditionalEdges(START, routeWorkflow)
  .addEdge("admin_workflow", END)
  .addEdge("employee_workflow", END);

let mainWorkflowPromise:
  | Promise<ReturnType<typeof mainWorkflowBuilder.compile>>
  | null = null;

export async function getMainWorkflow(): Promise<
  ReturnType<typeof mainWorkflowBuilder.compile>
> {
  if (!mainWorkflowPromise) {
    mainWorkflowPromise = (async () => {
      const checkpointer = await getWorkflowCheckpointer();
      return mainWorkflowBuilder.compile({ checkpointer });
    })();
  }

  return mainWorkflowPromise;
}

export async function invokeMainWorkflow(state: WorkflowState): Promise<WorkflowState> {
  const workflow = await getMainWorkflow();
  const result = await workflow.invoke(parseWorkflowState(state), {
    configurable: {
      thread_id: state.session.threadId,
    },
  });

  return parseWorkflowState(result);
}

export async function streamMainWorkflowResponse(state: WorkflowState) {
  parseWorkflowState(state);
  await getMainWorkflow();
  return {
    route: routeUserNode(state),
    stream: await streamSelectedAgentResponse(state),
    extractText,
  };
}
