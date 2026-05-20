import type { WorkflowMode, WorkflowState } from "../state.js";

export function routeUserNode(state: WorkflowState): WorkflowMode {
  return state.user.isAdmin ? "admin" : "employee";
}
