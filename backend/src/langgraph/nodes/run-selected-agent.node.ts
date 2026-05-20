import { invokeSelectedAgent } from "../agent-runtime.js";
import type { WorkflowState } from "../state.js";

export async function runSelectedAgentNode(
  state: WorkflowState,
): Promise<Pick<WorkflowState, "output">> {
  const response = await invokeSelectedAgent(state);
  return {
    output: { response },
  };
}
