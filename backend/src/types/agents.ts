export type AgentInfo = {
  role: string;
  goal: string;
  responsibilities: string;
  permissions: string;
  guardrails: string;
  work_style: string;
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
  created_at: Date;
  updated_at: Date;
  assigned_roles: string[];
  assigned_user_ids: string[];
};

export type AgentCreatePayload = {
  name: string;
  role: string;
  goal: string;
  responsibilities: string;
  permissions: string;
  guardrails: string;
  work_style: string;
  assigned_roles: string[];
  assigned_user_ids?: string[];
};
