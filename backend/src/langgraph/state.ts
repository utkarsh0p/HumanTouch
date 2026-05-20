import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

import type { AgentInfo } from "../types/agents.js";

export const workflowMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const postgresUuidSchema = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

export const workflowStateSchema = z.object({
  user: z.object({
    id: postgresUuidSchema,
    companyId: postgresUuidSchema,
    roleKey: z.string().min(1),
    isAdmin: z.boolean(),
  }),
  session: z.object({
    threadId: postgresUuidSchema,
    agentId: postgresUuidSchema,
    userPrompt: z.string().nullable(),
    systemPromptUsed: z.string(),
  }),
  agent: z.object({
    id: postgresUuidSchema,
    name: z.string().min(1),
    slug: z.string().min(1),
    agentInfo: z.unknown(),
    systemPrompt: z.string(),
    isSystem: z.boolean(),
  }),
  input: z.object({
    message: z.string().min(1),
  }),
  history: z.array(workflowMessageSchema),
  runtime: z.object({
    mode: z.enum(["admin", "employee"]),
    adminOverride: z.boolean(),
  }),
  output: z
    .object({
      response: z.string(),
    })
    .optional(),
});

export type WorkflowMessage = z.infer<typeof workflowMessageSchema>;
export type WorkflowState = z.infer<typeof workflowStateSchema> & {
  agent: z.infer<typeof workflowStateSchema>["agent"] & {
    agentInfo: AgentInfo;
  };
};
export type WorkflowMode = WorkflowState["runtime"]["mode"];

export const WorkflowAnnotation = Annotation.Root({
  user: Annotation<WorkflowState["user"]>(),
  session: Annotation<WorkflowState["session"]>(),
  agent: Annotation<WorkflowState["agent"]>(),
  input: Annotation<WorkflowState["input"]>(),
  history: Annotation<WorkflowState["history"]>(),
  runtime: Annotation<WorkflowState["runtime"]>(),
  output: Annotation<WorkflowState["output"]>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
});

export function parseWorkflowState(state: unknown): WorkflowState {
  return workflowStateSchema.parse(state) as WorkflowState;
}
