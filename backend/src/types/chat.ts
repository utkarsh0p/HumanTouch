export type SessionRecord = {
  thread_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  agent_id: string;
  user_prompt: string | null;
  system_prompt_used: string;
};

export type MessageRole = "user" | "assistant";

export type MessageRecord = {
  thread_id: string;
  role: MessageRole;
  content: string;
  created_at: Date;
};

export type SessionCreatePayload = {
  title?: string;
  agent_id?: string;
  user_prompt?: string;
};

export type SessionUpdatePayload = {
  title: string;
};

export type ChatStreamPayload = {
  thread_id: string;
  message: string;
};

export type AgentProgressStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "failed"
  | "need-help";

export type AgentProgressEvent = {
  id: string;
  parent_id?: string;
  title: string;
  description?: string;
  status: AgentProgressStatus;
  tools?: string[];
};
