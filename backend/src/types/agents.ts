export type AgentWorkspaceMode = "chat" | "agentic";

export type AgentWorkspaceInfo = {
  mode: AgentWorkspaceMode;
  objective: string;
  primary_deliverables: string;
  collaboration_notes: string;
};

export type AgentInfo = {
  role: string;
  goal: string;
  responsibilities: string;
  permissions: string;
  guardrails: string;
  work_style: string;
  allowed_tool_ids: string[];
  workspace: AgentWorkspaceInfo;
};

export type AgentRecord = {
  id: string;
  company_id: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  name: string;
  slug: string;
  agent_info: AgentInfo;
  system_prompt: string;
  prompt_version: number;
  system_prompt_generated_at: Date;
  is_system: boolean;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  assigned_roles: string[];
  assigned_user_ids: string[];
  assigned_user_emails: string[];
};

export type AgentCreatePayload = {
  name: string;
  purpose: string;
  allowed_tasks: string;
  restrictions: string;
  allowed_tool_ids?: string[];
  assigned_role_keys?: string[];
  assigned_user_emails?: string[];
};

export type AgentUpdatePayload = AgentCreatePayload;
