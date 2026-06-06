"use client";

import { Fragment, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  GitBranch,
  LogOut,
  Mail,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  UserCircle2,
  WandSparkles,
  X,
} from "lucide-react";

import { AuthSwitch } from "@/components/ui/auth-switch";
import { AgentPlan, type AgentPlanTask } from "@/components/ui/agent-plan";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";

type Session = {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  agent_id: string;
  user_prompt?: string | null;
  system_prompt_used?: string;
};

type Agent = {
  id: string;
  company_id: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  name: string;
  slug: string;
  agent_info: {
    role: string;
    goal: string;
    responsibilities: string;
    permissions: string;
    guardrails: string;
    work_style: string;
    allowed_toolkits: AgentToolkit[];
    allowed_tool_ids: string[];
    workspace: {
      mode: "chat" | "agentic";
      objective: string;
      primary_deliverables: string;
      collaboration_notes: string;
    };
  };
  system_prompt: string;
  prompt_version: number;
  system_prompt_generated_at: string;
  is_system: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_roles: string[];
  assigned_user_ids: string[];
  assigned_user_emails: string[];
};

type AgentToolkit = "gmail" | "github";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  run?: AgentRun;
};

type AgentRun = {
  status: "running" | "completed" | "failed";
  tasks: AgentPlanTask[];
  isExpanded: boolean;
};

type AuthenticatedUser = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role_key: string;
  is_admin: boolean;
};

type AgentProgressEvent = {
  id: string;
  parent_id?: string;
  title: string;
  description?: string;
  status: AgentPlanTask["status"];
  tools?: string[];
};

function createMessageId(role: ChatMessage["role"], createdAt: string, index?: number): string {
  return `${role}:${createdAt}:${index ?? crypto.randomUUID()}`;
}

function resolveApiBaseUrl(): string {
  const fallback = "http://localhost:3001";
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? fallback;
  }

  const browserBaseUrl = `${window.location.protocol}//${window.location.hostname}:3001`;
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!configuredBaseUrl) {
    return browserBaseUrl;
  }

  try {
    const configuredUrl = new URL(configuredBaseUrl);
    const isLocalPair =
      (configuredUrl.hostname === "localhost" && window.location.hostname === "127.0.0.1") ||
      (configuredUrl.hostname === "127.0.0.1" && window.location.hostname === "localhost");

    if (!isLocalPair) {
      return configuredBaseUrl;
    }

    return `${configuredUrl.protocol}//${window.location.hostname}${configuredUrl.port ? `:${configuredUrl.port}` : ""}`;
  } catch {
    return configuredBaseUrl;
  }
}

const apiBaseUrl = resolveApiBaseUrl();

const toolkitOptions: Array<{
  id: AgentToolkit;
  label: string;
  description: string;
}> = [
  {
    id: "gmail",
    label: "Gmail",
    description: "Email search, drafts, and sending through the user's connected Gmail account.",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Repository, issue, pull request, and developer workflow actions.",
  },
];

function sanitizeLinkTarget(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < text.length) {
    if (text[index] === "[") {
      const labelEnd = text.indexOf("]", index + 1);
      if (labelEnd !== -1 && text[labelEnd + 1] === "(") {
        const urlEnd = text.indexOf(")", labelEnd + 2);
        if (urlEnd !== -1) {
          const label = text.slice(index + 1, labelEnd);
          const href = sanitizeLinkTarget(text.slice(labelEnd + 2, urlEnd));
          if (href) {
            nodes.push(
              <a
                key={`link-${key++}`}
                className="text-[#f0b2a7] underline decoration-[#f0b2a7]/40 underline-offset-4 hover:text-[#ffc1b7]"
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                {renderInlineMarkdown(label)}
              </a>,
            );
            index = urlEnd + 1;
            continue;
          }
        }
      }
    }

    const rawUrlMatch = text.slice(index).match(/^https?:\/\/[^\s<>)]+/);
    if (rawUrlMatch) {
      const rawUrl = rawUrlMatch[0].replace(/[.,;:!?]+$/, "");
      const trailing = rawUrlMatch[0].slice(rawUrl.length);
      const href = sanitizeLinkTarget(rawUrl);
      if (href) {
        nodes.push(
          <a
            key={`url-${key++}`}
            className="break-all text-[#f0b2a7] underline decoration-[#f0b2a7]/40 underline-offset-4 hover:text-[#ffc1b7]"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {rawUrl}
          </a>,
        );
        if (trailing) {
          nodes.push(<Fragment key={`url-trailing-${key++}`}>{trailing}</Fragment>);
        }
        index += rawUrlMatch[0].length;
        continue;
      }
    }

    if (text.startsWith("**", index)) {
      const closingIndex = text.indexOf("**", index + 2);
      if (closingIndex !== -1) {
        const content = text.slice(index + 2, closingIndex);
        nodes.push(<strong key={`strong-${key++}`}>{renderInlineMarkdown(content)}</strong>);
        index = closingIndex + 2;
        continue;
      }
    }

    if (text[index] === "*") {
      const closingIndex = text.indexOf("*", index + 1);
      if (closingIndex !== -1) {
        const content = text.slice(index + 1, closingIndex);
        nodes.push(<em key={`em-${key++}`}>{renderInlineMarkdown(content)}</em>);
        index = closingIndex + 1;
        continue;
      }
    }

    if (text[index] === "`") {
      const closingIndex = text.indexOf("`", index + 1);
      if (closingIndex !== -1) {
        const content = text.slice(index + 1, closingIndex);
        nodes.push(
          <code
            key={`code-${key++}`}
            className="rounded-md bg-[#2b2824] px-1.5 py-0.5 text-[0.88em] text-[#f1e6d4]"
          >
            {content}
          </code>,
        );
        index = closingIndex + 1;
        continue;
      }
    }

    let nextIndex = index + 1;
    while (
      nextIndex < text.length &&
      !text.startsWith("**", nextIndex) &&
      text[nextIndex] !== "[" &&
      text[nextIndex] !== "*" &&
      text[nextIndex] !== "`" &&
      !text.slice(nextIndex).match(/^https?:\/\/[^\s<>)]+/)
    ) {
      nextIndex += 1;
    }

    nodes.push(<Fragment key={`text-${key++}`}>{text.slice(index, nextIndex)}</Fragment>);
    index = nextIndex;
  }

  return nodes;
}

function renderAssistantMarkdown(content: string): ReactNode {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const currentLine = lines[index];
    const trimmedLine = currentLine.trim();

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.*)$/);
    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.*)$/);

    if (orderedMatch) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^\d+\.\s+(.*)$/);
        if (!match) {
          break;
        }
        items.push(<li key={`oli-${key++}`}>{renderInlineMarkdown(match[1])}</li>);
        index += 1;
      }
      blocks.push(
        <ol
          key={`ol-${key++}`}
          className="list-decimal space-y-1.5 pl-6 marker:text-[#9f9788]"
        >
          {items}
        </ol>,
      );
      continue;
    }

    if (unorderedMatch) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^[-*]\s+(.*)$/);
        if (!match) {
          break;
        }
        items.push(<li key={`uli-${key++}`}>{renderInlineMarkdown(match[1])}</li>);
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc space-y-1.5 pl-6 marker:text-[#9f9788]">
          {items}
        </ul>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const nextTrimmed = lines[index].trim();
      if (
        !nextTrimmed ||
        /^\d+\.\s+/.test(nextTrimmed) ||
        /^[-*]\s+/.test(nextTrimmed)
      ) {
        break;
      }
      paragraphLines.push(nextTrimmed);
      index += 1;
    }

    blocks.push(
      <p key={`p-${key++}`} className="leading-6">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}

export default function HomePage() {
  const [agentFormMode, setAgentFormMode] = useState<"create" | "edit">("create");
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isAgentsLoading, setIsAgentsLoading] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [agentName, setAgentName] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("");
  const [agentAllowedTasks, setAgentAllowedTasks] = useState("");
  const [agentRestrictions, setAgentRestrictions] = useState("");
  const [employeeEmailDraft, setEmployeeEmailDraft] = useState("");
  const [selectedToolkits, setSelectedToolkits] = useState<AgentToolkit[]>([]);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAgentListOpen, setIsAgentListOpen] = useState(false);
  const [openAgentMenuId, setOpenAgentMenuId] = useState<string | null>(null);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [isRenamingSession, setIsRenamingSession] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<Session | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [archivingAgentId, setArchivingAgentId] = useState<string | null>(null);
  const [pendingArchiveAgent, setPendingArchiveAgent] = useState<Agent | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const agentMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth") || params.has("auth_status") || params.has("auth_detail")) {
      params.delete("auth");
      params.delete("auth_status");
      params.delete("auth_detail");
      const nextSearch = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
      );
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      resetWorkspace();
      setIsAuthLoading(false);
      return;
    }

    void loadWorkspace();
  }, [currentUser]);

  useEffect(() => {
    activeAssistantMessageIdRef.current = null;

    if (!currentUser || !activeThreadId) {
      setMessages([]);
      return;
    }

    void loadMessages(activeThreadId);
  }, [activeThreadId, currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setIsDesktopSidebarCollapsed(false);
      setIsMobileSidebarOpen(false);
      return;
    }

    function syncSidebarForViewport() {
      if (window.innerWidth >= 1024) {
        setIsMobileSidebarOpen(false);
      }
    }

    syncSidebarForViewport();
    window.addEventListener("resize", syncSidebarForViewport);
    return () => window.removeEventListener("resize", syncSidebarForViewport);
  }, [currentUser]);

  useEffect(() => {
    if (!openAgentMenuId) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!agentMenuRef.current?.contains(event.target as Node)) {
        setOpenAgentMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openAgentMenuId]);

  useEffect(() => {
    if (!openSessionMenuId) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!sessionMenuRef.current?.contains(event.target as Node)) {
        setOpenSessionMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openSessionMenuId]);

  useEffect(() => {
    if (!activeThreadId || !transcriptRef.current) {
      return;
    }

    scrollTranscriptToBottom("auto");
  }, [activeThreadId]);

  function resetWorkspace() {
    setAgents([]);
    setSelectedAgentId(null);
    setSessions([]);
    setActiveThreadId(null);
    setMessages([]);
    activeAssistantMessageIdRef.current = null;
    setDraft("");
    setFiles([]);
    setIsAgentFormOpen(false);
    setAgentFormMode("create");
    setIsAgentListOpen(false);
    setIsMobileSidebarOpen(false);
    setOpenAgentMenuId(null);
    setOpenSessionMenuId(null);
    setEditingSessionId(null);
    setEditingSessionTitle("");
    setPendingDeleteSession(null);
    setEditingAgentId(null);
    setPendingArchiveAgent(null);
    setAuthNotice(null);
    resetCreateAgentForm();
  }

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setIsDesktopSidebarCollapsed((current) => !current);
      return;
    }

    setIsMobileSidebarOpen((current) => !current);
  }

  function closeMobileSidebar() {
    setIsMobileSidebarOpen(false);
  }

  function scrollTranscriptToBottom(behavior: ScrollBehavior = "smooth") {
    const container = transcriptRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }

  function updateAutoScrollState() {
    const container = transcriptRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 120;
  }

  function resetCreateAgentForm() {
    setAgentName("");
    setAgentPurpose("");
    setAgentAllowedTasks("");
    setAgentRestrictions("");
    setEmployeeEmailDraft("");
    setSelectedToolkits([]);
  }

  function mergeAgentProgress(
    currentTasks: AgentPlanTask[],
    event: AgentProgressEvent,
  ): AgentPlanTask[] {
    if (event.parent_id) {
      const parentIndex = currentTasks.findIndex((task) => task.id === event.parent_id);
      const parentTask =
        parentIndex >= 0
          ? currentTasks[parentIndex]
          : {
              id: event.parent_id,
              title: "Run tool calls",
              description: "Executing external tools.",
              status: "in-progress" as const,
              tools: [],
              subtasks: [],
            };
      const subtask = {
        id: event.id,
        title: event.title,
        description: event.description,
        status: event.status,
        tools: event.tools,
      };
      const subtaskIndex = parentTask.subtasks.findIndex((item) => item.id === event.id);
      const nextSubtasks =
        subtaskIndex >= 0
          ? parentTask.subtasks.map((item) => (item.id === event.id ? subtask : item))
          : [...parentTask.subtasks, subtask];
      const nextParent = {
        ...parentTask,
        subtasks: nextSubtasks,
      };

      if (parentIndex >= 0) {
        return currentTasks.map((task) => (task.id === event.parent_id ? nextParent : task));
      }

      return [...currentTasks, nextParent];
    }

    const task = {
      id: event.id,
      title: event.title,
      description: event.description,
      status: event.status,
      tools: event.tools,
      subtasks: currentTasks.find((item) => item.id === event.id)?.subtasks ?? [],
    };
    const taskIndex = currentTasks.findIndex((item) => item.id === event.id);

    if (taskIndex >= 0) {
      return currentTasks.map((item) => (item.id === event.id ? task : item));
    }

    return [...currentTasks, task];
  }

  function toggleMessageRun(messageId: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.run
          ? {
              ...message,
              run: {
                ...message.run,
                isExpanded: !message.run.isExpanded,
              },
            }
          : message,
      ),
    );
  }

  function openCreateAgentForm() {
    resetCreateAgentForm();
    setEditingAgentId(null);
    setAgentFormMode("create");
    setOpenAgentMenuId(null);
    setIsAgentFormOpen(true);
  }

  function openEditAgentForm(agent: Agent) {
    setAgentName(agent.name);
    setAgentPurpose(agent.agent_info.goal ?? "");
    setAgentAllowedTasks(agent.agent_info.responsibilities ?? "");
    setAgentRestrictions(agent.agent_info.guardrails ?? "");
    setEmployeeEmailDraft(agent.assigned_user_emails.join(", "));
    setSelectedToolkits(agent.agent_info.allowed_toolkits ?? []);
    setEditingAgentId(agent.id);
    setAgentFormMode("edit");
    setOpenAgentMenuId(null);
    setIsAgentFormOpen(true);
  }

  function toggleToolkit(toolkit: AgentToolkit) {
    setSelectedToolkits((current) =>
      current.includes(toolkit)
        ? current.filter((currentToolkit) => currentToolkit !== toolkit)
        : [...current, toolkit],
    );
  }

  function startRenamingSession(session: Session) {
    setEditingSessionId(session.thread_id);
    setEditingSessionTitle(session.title);
    setOpenSessionMenuId(null);
  }

  function cancelRenamingSession() {
    setEditingSessionId(null);
    setEditingSessionTitle("");
    setIsRenamingSession(false);
  }

  async function apiFetch(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: init?.cache ?? "no-store",
    });

    if (response.status === 401) {
      setCurrentUser(null);
      throw new Error("Authentication required.");
    }

    return response;
  }

  async function parseError(response: Response, fallback: string) {
    try {
      const data = (await response.json()) as { detail?: string; message?: string };
      return data.detail ?? data.message ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function loadCurrentUser() {
    setIsAuthLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to restore your session."));
      }

      const data = (await response.json()) as { user: AuthenticatedUser | null };
      setCurrentUser(data.user);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to restore your session.",
      );
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function loadWorkspace() {
    setError(null);
    await Promise.all([loadAgents(), loadSessions()]);
  }

  async function loadAgents() {
    setIsAgentsLoading(true);

    try {
      const response = await apiFetch("/api/agents");

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to load agents."));
      }

      const data = (await response.json()) as Agent[];
      setAgents(data);

      setSelectedAgentId((current) => {
        if (current && data.some((agent) => agent.id === current)) {
          return current;
        }

        return data[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load agents.");
    } finally {
      setIsAgentsLoading(false);
    }
  }

  async function loadSessions() {
    setIsSessionsLoading(true);

    try {
      const response = await apiFetch("/api/sessions");

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to load sessions."));
      }

      const data = (await response.json()) as Session[];
      setSessions(data);

      if (!activeThreadId && data.length > 0) {
        setActiveThreadId(data[0].thread_id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load sessions.");
    } finally {
      setIsSessionsLoading(false);
    }
  }

  async function loadMessages(threadId: string) {
    try {
      const response = await apiFetch(`/api/sessions/${threadId}/messages`);

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to load messages."));
      }

      const data = (await response.json()) as Array<Omit<ChatMessage, "id" | "run">>;
      setMessages(
        data.map((message, index) => ({
          ...message,
          id: createMessageId(message.role, message.created_at, index),
        })),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load messages.");
    }
  }

  async function handleLogin(values: { email: string; password: string }) {
    setIsAuthSubmitting(true);
    setError(null);
    setAuthNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        return await parseError(response, "Failed to sign in.");
      }

      const data = (await response.json()) as { user: AuthenticatedUser };
      setCurrentUser(data.user);
      return null;
    } catch (loginError) {
      return loginError instanceof Error ? loginError.message : "Failed to sign in.";
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleSignup(values: {
    fullName: string;
    email: string;
    password: string;
  }) {
    setIsAuthSubmitting(true);
    setError(null);
    setAuthNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/signup`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: values.fullName,
          email: values.email,
          password: values.password,
        }),
      });

      if (!response.ok) {
        return await parseError(response, "Failed to create your account.");
      }

      const data = (await response.json()) as { user: AuthenticatedUser };
      setCurrentUser(data.user);
      return null;
    } catch (signupError) {
      return signupError instanceof Error
        ? signupError.message
        : "Failed to create your account.";
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setCurrentUser(null);
      setError(null);
      resetWorkspace();
    }
  }

  async function createSession(agentId?: string) {
    setError(null);

    const nextAgentId = agentId ?? selectedAgentId ?? agents[0]?.id;
    if (!nextAgentId) {
      setError("No assigned agent is available for a new chat yet.");
      return;
    }

    const currentSession = activeThreadId
      ? sessions.find((session) => session.thread_id === activeThreadId)
      : null;

    if (currentSession && currentSession.agent_id === nextAgentId && messages.length === 0) {
      setActiveThreadId(currentSession.thread_id);
      setSelectedAgentId(currentSession.agent_id);
      setFiles([]);
      return;
    }

    try {
      const response = await apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          agent_id: nextAgentId,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to create session."));
      }

      const session = (await response.json()) as Session;
      setSessions((current) => [session, ...current]);
      setActiveThreadId(session.thread_id);
      setMessages([]);
      setFiles([]);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create session.",
      );
    }
  }

  async function renameSession(threadId: string) {
    if (!editingSessionTitle.trim() || isRenamingSession) {
      return;
    }

    setError(null);
    setIsRenamingSession(true);

    try {
      const response = await apiFetch(`/api/sessions/${threadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editingSessionTitle.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to rename session."));
      }

      const updatedSession = (await response.json()) as Session;
      setSessions((current) =>
        current.map((session) =>
          session.thread_id === updatedSession.thread_id ? updatedSession : session,
        ),
      );
      cancelRenamingSession();
    } catch (renameError) {
      setError(
        renameError instanceof Error ? renameError.message : "Failed to rename session.",
      );
    } finally {
      setIsRenamingSession(false);
    }
  }

  function promptDeleteSession(session: Session) {
    if (!currentUser?.is_admin) {
      return;
    }

    setOpenSessionMenuId(null);
    setPendingDeleteSession(session);
  }

  async function deleteSession(threadId: string) {
    if (!currentUser?.is_admin || deletingSessionId) {
      return;
    }

    setError(null);
    setDeletingSessionId(threadId);
    setOpenSessionMenuId(null);

    try {
      const response = await apiFetch(`/api/sessions/${threadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to delete session."));
      }

      const remainingSessions = sessions.filter((session) => session.thread_id !== threadId);
      setSessions(remainingSessions);

      if (activeThreadId === threadId) {
        const nextSession = remainingSessions[0] ?? null;
        setActiveThreadId(nextSession?.thread_id ?? null);
        setSelectedAgentId(nextSession?.agent_id ?? selectedAgentId);
        setMessages([]);
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete session.",
      );
    } finally {
      setDeletingSessionId(null);
      setPendingDeleteSession(null);
    }
  }

  async function submitMessage() {
    if (!draft.trim() || isSending) {
      return;
    }

    setError(null);
    setIsSending(true);

    let threadId = activeThreadId;
    const composingAgentId = selectedAgentId ?? agents[0]?.id;

    if (!threadId) {
      if (!composingAgentId) {
        setError("No assigned agent is available for this conversation.");
        setIsSending(false);
        return;
      }

      try {
        const response = await apiFetch("/api/sessions", {
          method: "POST",
          body: JSON.stringify({
            agent_id: composingAgentId,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseError(response, "Failed to create session."));
        }

        const session = (await response.json()) as Session;
        threadId = session.thread_id;
        setSessions((current) => [session, ...current]);
        setActiveThreadId(threadId);
      } catch (createError) {
        setError(
          createError instanceof Error ? createError.message : "Failed to create session.",
        );
        setIsSending(false);
        return;
      }
    }

    const userText = draft.trim();
    const userCreatedAt = new Date().toISOString();
    const assistantCreatedAt = new Date().toISOString();
    const assistantMessageId = createMessageId("assistant", assistantCreatedAt);
    activeAssistantMessageIdRef.current = assistantMessageId;
    setDraft("");
    setMessages((current) => [
      ...current,
      {
        id: createMessageId("user", userCreatedAt),
        role: "user",
        content: userText,
        created_at: userCreatedAt,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        created_at: assistantCreatedAt,
        run: {
          status: "running",
          tasks: [],
          isExpanded: true,
        },
      },
    ]);
    shouldAutoScrollRef.current = true;
    requestAnimationFrame(() => scrollTranscriptToBottom("smooth"));

    try {
      const response = await apiFetch("/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({
          thread_id: threadId,
          message: userText,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await parseError(response, "Failed to stream assistant response."));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let streamFailure: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const errorDetail = applySseFrame(frame);
          if (errorDetail) {
            streamFailure = errorDetail;
          }
        }
      }

      if (buffer.trim()) {
        const errorDetail = applySseFrame(buffer);
        if (errorDetail) {
          streamFailure = errorDetail;
        }
      }

      if (streamFailure) {
        throw new Error(streamFailure);
      }

      await loadSessions();
      setFiles([]);
    } catch (streamError) {
      const activeAssistantMessageId = activeAssistantMessageIdRef.current;
      if (activeAssistantMessageId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === activeAssistantMessageId && message.run
              ? {
                  ...message,
                  run: {
                    ...message.run,
                    status: "failed",
                    isExpanded: true,
                  },
                }
              : message,
          ),
        );
      }
      setError(
        streamError instanceof Error
          ? streamError.message
          : "Failed to stream assistant response.",
      );
    } finally {
      setIsSending(false);
      activeAssistantMessageIdRef.current = null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  function applySseFrame(frame: string): string | null {
    const lines = frame.split("\n");
    let eventName = "message";
    let payload = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      }

      if (line.startsWith("data:")) {
        payload += `${payload ? "\n" : ""}${line.slice(5).trimStart()}`;
      }
    }

    if (!payload) {
      return null;
    }

    if (eventName === "token") {
      const parsed = JSON.parse(payload) as { text: string };
      const activeAssistantMessageId = activeAssistantMessageIdRef.current;
      setMessages((current) => {
        if (activeAssistantMessageId) {
          return current.map((message) =>
            message.id === activeAssistantMessageId
              ? {
                  ...message,
                  content: `${message.content}${parsed.text}`,
                }
              : message,
          );
        }

        const lastIndex = current.length - 1;
        if (lastIndex < 0) {
          return current;
        }

        return current.map((message, index) =>
          index === lastIndex
            ? {
                ...message,
                content: `${message.content}${parsed.text}`,
              }
            : message,
        );
      });

      requestAnimationFrame(() => {
        if (shouldAutoScrollRef.current) {
          scrollTranscriptToBottom("auto");
        }
      });

      return null;
    }

    if (eventName === "progress") {
      const parsed = JSON.parse(payload) as AgentProgressEvent;
      const activeAssistantMessageId = activeAssistantMessageIdRef.current;
      if (activeAssistantMessageId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === activeAssistantMessageId
              ? {
                  ...message,
                  run: {
                    status: "running",
                    tasks: mergeAgentProgress(message.run?.tasks ?? [], parsed),
                    isExpanded: true,
                  },
                }
              : message,
          ),
        );
      }
      return null;
    }

    if (eventName === "error") {
      const parsed = JSON.parse(payload) as { detail?: string };
      const activeAssistantMessageId = activeAssistantMessageIdRef.current;
      if (activeAssistantMessageId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === activeAssistantMessageId && message.run
              ? {
                  ...message,
                  run: {
                    ...message.run,
                    status: "failed",
                    isExpanded: true,
                  },
                }
              : message,
          ),
        );
      }
      return parsed.detail ?? "Streaming failed.";
    }

    if (eventName === "done") {
      const parsed = JSON.parse(payload) as { thread_id?: string; title?: string };
      const activeAssistantMessageId = activeAssistantMessageIdRef.current;
      if (activeAssistantMessageId) {
        setMessages((current) =>
          current.map((message) =>
            message.id === activeAssistantMessageId && message.run
              ? {
                  ...message,
                  run: {
                    ...message.run,
                    status: "completed",
                    isExpanded: false,
                  },
                }
              : message,
          ),
        );
      }
      if (parsed.thread_id && parsed.title) {
        setSessions((current) =>
          current.map((session) =>
            session.thread_id === parsed.thread_id
              ? { ...session, title: parsed.title ?? session.title }
              : session,
          ),
        );
      }

      return null;
    }

    return null;
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) {
      return;
    }

    const nextFiles = Array.from(event.target.files);
    setFiles((current) => [...current, ...nextFiles]);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  }

  async function handleSubmitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsCreatingAgent(true);

    try {
      const isEditMode = agentFormMode === "edit" && editingAgentId;
      const response = await apiFetch(isEditMode ? `/api/agents/${editingAgentId}` : "/api/agents", {
        method: isEditMode ? "PATCH" : "POST",
        body: JSON.stringify({
          name: agentName,
          purpose: agentPurpose,
          allowed_tasks: agentAllowedTasks,
          restrictions: agentRestrictions,
          allowed_toolkits: selectedToolkits,
          ...(!isEditingSystemAgent
            ? {
                assigned_user_emails: employeeEmailDraft
                  .split(",")
                  .map((email) => email.trim().toLowerCase())
                  .filter(Boolean),
              }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(
          await parseError(
            response,
            isEditMode ? "Failed to update agent." : "Failed to create agent.",
          ),
        );
      }

      const agent = (await response.json()) as Agent;
      setAgents((current) => {
        if (isEditMode) {
          return current.map((currentAgent) =>
            currentAgent.id === agent.id ? agent : currentAgent,
          );
        }

        return [...current, agent];
      });
      setSelectedAgentId((current) => current ?? agent.id);
      if (!isEditMode) {
        setSelectedAgentId(agent.id);
      }
      resetCreateAgentForm();
      setEditingAgentId(null);
      setAgentFormMode("create");
      setIsAgentFormOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : agentFormMode === "edit"
            ? "Failed to update agent."
            : "Failed to create agent.",
      );
    } finally {
      setIsCreatingAgent(false);
    }
  }

  function promptArchiveAgent(agent: Agent) {
    if (!currentUser?.is_admin || agent.is_system) {
      return;
    }

    setOpenAgentMenuId(null);
    setPendingArchiveAgent(agent);
  }

  async function archiveCurrentAgent(agent: Agent) {
    if (!currentUser?.is_admin || archivingAgentId) {
      return;
    }

    setError(null);
    setArchivingAgentId(agent.id);
    setOpenAgentMenuId(null);

    try {
      const response = await apiFetch(`/api/agents/${agent.id}/archive`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to archive agent."));
      }

      const archivedAgent = (await response.json()) as Agent;
      setAgents((current) => {
        const remainingAgents = current.filter((currentAgent) => currentAgent.id !== archivedAgent.id);
        setSelectedAgentId((currentSelectedAgentId) =>
          currentSelectedAgentId === archivedAgent.id
            ? remainingAgents[0]?.id ?? null
            : currentSelectedAgentId,
        );
        return remainingAgents;
      });
      setPendingArchiveAgent(null);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive agent.");
    } finally {
      setArchivingAgentId(null);
    }
  }

  if (isAuthLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="rounded-[2rem] border border-white/8 bg-[#211f1b] px-6 py-5 text-center">
          <p className="[font-family:var(--font-display)] text-3xl text-[#ece4d7]">
            HumanTouch
          </p>
          <p className="mt-2 text-sm text-[#9b9386]">Restoring your workspace...</p>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <AuthSwitch
        isLoading={isAuthSubmitting}
        notice={authNotice}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    );
  }

  const activeSession = sessions.find((session) => session.thread_id === activeThreadId);
  const activeAgent =
    agents.find((agent) => agent.id === activeSession?.agent_id) ??
    agents.find((agent) => agent.id === selectedAgentId) ??
    agents[0] ??
    null;

  const greeting = activeSession ? activeSession.title : "How can I help you?";
  const sidebarSelectionAgentId = activeSession?.agent_id ?? selectedAgentId;
  const activeAgentIds = new Set(agents.map((agent) => agent.id));
  const activeAgentName = activeAgent?.name ?? (activeSession ? "Archived agent" : "Choose an agent");
  const editingAgent = editingAgentId
    ? agents.find((agent) => agent.id === editingAgentId) ?? null
    : null;
  const isEditingSystemAgent = Boolean(editingAgent?.is_system);
  const filteredSessions = sessions.filter((session) => {
    if (!sidebarSelectionAgentId) {
      return !activeAgentIds.has(session.agent_id);
    }

    return session.agent_id === sidebarSelectionAgentId || !activeAgentIds.has(session.agent_id);
  });
  const displayMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(
      ({ message, index }) =>
        message.content.trim() || message.run || (isSending && index === messages.length - 1),
    );
  const hasConversation = displayMessages.length > 0;
  const sidebarToggleTitle = isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  function renderComposer(className?: string) {
    return (
      <div className={className}>
        <PromptInput
          className="rounded-[1.75rem] border-white/8 bg-[#2a2824] p-2.5 shadow-none"
          isLoading={isSending}
          maxHeight={176}
          onSubmit={() => {
            void submitMessage();
          }}
          onValueChange={setDraft}
          value={draft}
        >
          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-1 pb-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-2xl bg-[#37332d] px-3 py-1.5 text-[0.8rem] text-[#ddd5c8]"
                >
                  <Paperclip className="size-3.5" />
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <button
                    className="rounded-full p-1 transition hover:bg-white/10"
                    onClick={() => removeFile(index)}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <PromptInputTextarea
            className="min-h-[3.5rem] px-3 py-2.5 text-[0.95rem] leading-6 text-[#f0ebe2] placeholder:text-[#6f695f] sm:min-h-[4rem]"
            placeholder="Ask something about your work, your agents, or the current task..."
          />

              <PromptInputActions className="flex-col items-stretch gap-2 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2.5 text-[0.82rem] text-[#bbb4a7]">
              <PromptInputAction tooltip="Attach files">
                <label
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/6"
                  htmlFor="file-upload"
                >
                  <input
                    ref={uploadInputRef}
                    className="hidden"
                    id="file-upload"
                    multiple
                    onChange={handleFileChange}
                    type="file"
                  />
                  <Plus className="size-4" />
                </label>
              </PromptInputAction>
              <span className="truncate">{activeAgent?.name ?? (activeSession ? "Archived agent" : "No agent selected")}</span>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <PromptInputAction tooltip={isSending ? "Generating response" : "Send message"}>
                <Button
                  className="h-9 w-9 rounded-full bg-[#f1ede6] text-[#1a1916] hover:bg-[#fffaf0]"
                  disabled={isSending || !draft.trim() || agents.length === 0}
                  onClick={() => {
                    void submitMessage();
                  }}
                  size="icon"
                  type="button"
                  variant="default"
                >
                  {isSending ? (
                    <Square className="size-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="size-3.5" />
                  )}
                </Button>
              </PromptInputAction>
            </div>
          </PromptInputActions>
        </PromptInput>
        {error ? <div className="mt-3 text-sm text-[#d97757]">{error}</div> : null}
      </div>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(217,119,87,0.14),_transparent_28%),linear-gradient(180deg,_#1b1a17_0%,_#171511_100%)] text-foreground">
      <div className="relative flex h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

        {pendingDeleteSession ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#1f1c18] p-6 shadow-[0_35px_100px_rgba(0,0,0,0.45)]">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#8e8678]">
                Delete Session
              </p>
              <h2 className="mt-3 [font-family:var(--font-display)] text-[2rem] leading-none tracking-[-0.04em] text-[#efe7d8]">
                Remove this session?
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#a89f92]">
                This will delete <span className="text-[#efe7d8]">{pendingDeleteSession.title}</span>{" "}
                from the session list and remove its chat history from the app view.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  className="rounded-full px-4 py-2 text-sm text-[#bdb4a7] transition hover:bg-white/6"
                  disabled={Boolean(deletingSessionId)}
                  onClick={() => setPendingDeleteSession(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[#f0b2a7] px-5 py-2 text-sm text-[#1b1714] transition hover:bg-[#ffc1b7] disabled:bg-[#7f675f] disabled:text-[#d6c8c1]"
                  disabled={deletingSessionId === pendingDeleteSession.thread_id}
                  onClick={() => {
                    void deleteSession(pendingDeleteSession.thread_id);
                  }}
                  type="button"
                >
                  {deletingSessionId === pendingDeleteSession.thread_id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingArchiveAgent ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#1f1c18] p-6 shadow-[0_35px_100px_rgba(0,0,0,0.45)]">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#8e8678]">
                Archive Agent
              </p>
              <h2 className="mt-3 [font-family:var(--font-display)] text-[2rem] leading-none tracking-[-0.04em] text-[#efe7d8]">
                Archive this agent?
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#a89f92]">
                <span className="text-[#efe7d8]">{pendingArchiveAgent.name}</span> will be removed
                from the active agent list and blocked for new sessions. Existing chat history stays
                intact.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  className="rounded-full px-4 py-2 text-sm text-[#bdb4a7] transition hover:bg-white/6"
                  disabled={Boolean(archivingAgentId)}
                  onClick={() => setPendingArchiveAgent(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[#f0b2a7] px-5 py-2 text-sm text-[#1b1714] transition hover:bg-[#ffc1b7] disabled:bg-[#7f675f] disabled:text-[#d6c8c1]"
                  disabled={archivingAgentId === pendingArchiveAgent.id}
                  onClick={() => {
                    void archiveCurrentAgent(pendingArchiveAgent);
                  }}
                  type="button"
                >
                  {archivingAgentId === pendingArchiveAgent.id ? "Archiving..." : "Archive"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {currentUser.is_admin && isAgentFormOpen ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-4 sm:py-6">
            <button
              aria-label={agentFormMode === "edit" ? "Close edit agent dialog" : "Close create agent dialog"}
              className="absolute inset-0"
              onClick={() => {
                resetCreateAgentForm();
                setEditingAgentId(null);
                setAgentFormMode("create");
                setIsAgentFormOpen(false);
              }}
              type="button"
            />
            <div className="relative z-10 flex min-h-full items-start justify-center sm:items-center">
              <form
                className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#26231f] p-5 shadow-[0_35px_100px_rgba(0,0,0,0.45)] sm:max-h-[calc(100vh-3rem)]"
                onSubmit={handleSubmitAgent}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[#9d9586]">
                      {agentFormMode === "edit" ? "Edit Agent" : "New Agent"}
                    </p>
                    <h2 className="mt-2 [font-family:var(--font-display)] text-[1.65rem] leading-none tracking-[-0.03em] text-[#f2ede3]">
                      {agentFormMode === "edit" ? "Update this agent" : "Create an agent"}
                    </h2>
                  </div>
                  <button
                    aria-label={agentFormMode === "edit" ? "Close edit agent dialog" : "Close create agent dialog"}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#bfb7ab] transition hover:bg-white/5"
                    onClick={() => {
                      resetCreateAgentForm();
                      setEditingAgentId(null);
                      setAgentFormMode("create");
                      setIsAgentFormOpen(false);
                    }}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-4 space-y-3 overflow-y-auto pr-1">
                  <input
                    className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                    onChange={(event) => setAgentName(event.target.value)}
                    placeholder="Agent name"
                    value={agentName}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                    onChange={(event) => setAgentPurpose(event.target.value)}
                    placeholder="What should this agent help employees with?"
                    value={agentPurpose}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                    onChange={(event) => setAgentAllowedTasks(event.target.value)}
                    placeholder="What tasks is it allowed to do?"
                    value={agentAllowedTasks}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                    onChange={(event) => setAgentRestrictions(event.target.value)}
                    placeholder="What should it avoid or never do?"
                    value={agentRestrictions}
                  />
                  {!isEditingSystemAgent ? (
                    <input
                      className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                      onChange={(event) => setEmployeeEmailDraft(event.target.value)}
                      placeholder="Enter the assignee email"
                      value={employeeEmailDraft}
                    />
                  ) : null}
                  <div className="rounded-2xl border border-white/8 bg-[#1e1b18] p-3">
	                    <div className="mb-3 flex items-center justify-between gap-3">
	                      <p className="text-sm text-[#f2ede3]">Toolkits</p>
	                      <span className="text-[11px] text-[#8f8778]">
	                        {selectedToolkits.length > 0
	                          ? `${selectedToolkits.length} selected`
	                          : "All discoverable"}
	                      </span>
	                    </div>
	                    <p className="mb-3 text-xs leading-5 text-[#8f8778]">
	                      Select toolkits to restrict this agent. Leave blank to allow Composio
	                      meta-tools to discover available toolkits at runtime.
	                    </p>
	                    <div className="grid gap-2 sm:grid-cols-2">
                      {toolkitOptions.map((toolkit) => {
                        const isSelected = selectedToolkits.includes(toolkit.id);
                        const Icon = toolkit.id === "gmail" ? Mail : GitBranch;

                        return (
                          <button
                            key={toolkit.id}
                            className={`flex min-h-24 items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                              isSelected
                                ? "border-[#f0b2a7]/70 bg-[#332722] text-[#f4e6de]"
                                : "border-white/8 bg-[#24211d] text-[#bbb4a7] hover:bg-[#2b2824]"
                            }`}
                            onClick={() => toggleToolkit(toolkit.id)}
                            type="button"
                          >
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                                isSelected
                                  ? "border-[#f0b2a7]/60 bg-[#4b312a] text-[#ffd0c6]"
                                  : "border-white/10 bg-[#1e1b18] text-[#928a7c]"
                              }`}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{toolkit.label}</span>
                              <span className="mt-1 block text-xs leading-5 text-[#8f8778]">
                                {toolkit.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex shrink-0 items-center justify-between gap-3">
                  <button
                    className="text-sm text-[#a79f91]"
                    onClick={() => {
                      resetCreateAgentForm();
                      setEditingAgentId(null);
                      setAgentFormMode("create");
                      setIsAgentFormOpen(false);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                  <Button
                    className="rounded-full bg-[#f0ece4] px-4 text-[#1c1b18] hover:bg-[#fffaf0]"
                    disabled={
                      isCreatingAgent ||
                      !agentName.trim() ||
                      !agentPurpose.trim() ||
                      !agentAllowedTasks.trim() ||
                      !agentRestrictions.trim()
                    }
                    type="submit"
                  >
                    {isCreatingAgent
                      ? agentFormMode === "edit"
                        ? "Saving..."
                        : "Creating..."
                      : agentFormMode === "edit"
                        ? "Save changes"
                        : "Save"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isMobileSidebarOpen ? (
          <button
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-black/55 lg:hidden"
            onClick={closeMobileSidebar}
            type="button"
          />
        ) : null}

        <div className="relative flex h-full min-h-0 w-full overflow-hidden">
          <aside
            className={`fixed inset-y-0 left-0 z-40 flex w-[19.5rem] max-w-[86vw] flex-col border-r border-white/8 bg-[#1d1b18]/96 px-4 py-4 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 lg:static lg:max-w-none lg:shadow-none ${
              isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            } ${
              isDesktopSidebarCollapsed
                ? "lg:w-0 lg:min-w-0 lg:translate-x-0 lg:overflow-hidden lg:border-r-0 lg:px-0 lg:py-0 lg:opacity-0 lg:pointer-events-none"
                : "lg:h-full lg:w-[20.5rem] lg:translate-x-0 lg:opacity-100"
            }`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="grid gap-2">
                <button
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[#26231f] px-3.5 py-2.5 text-left text-[0.95rem] text-[#ede6d9] transition hover:bg-[#2d2925]"
                  onClick={() => {
                    void createSession(selectedAgentId ?? undefined);
                    closeMobileSidebar();
                  }}
                  type="button"
                >
                  <Plus className="size-4" />
                  New chat
                </button>
                {currentUser.is_admin ? (
                  <button
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-[0.95rem] text-[#c6bfb2] transition hover:bg-white/5"
                    onClick={() => {
                      if (isAgentFormOpen && agentFormMode === "create") {
                        resetCreateAgentForm();
                        setEditingAgentId(null);
                        setAgentFormMode("create");
                        setIsAgentFormOpen(false);
                        return;
                      }

                      openCreateAgentForm();
                    }}
                    type="button"
                  >
                    <WandSparkles className="size-4" />
                    {isAgentFormOpen && agentFormMode === "create" ? "Close agent form" : "Create agent"}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
                <section className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[1.4rem] border border-white/8 bg-[#22201c] px-3 py-3">
                  <div className="flex items-center justify-between px-2">
                    <div>
                      <p className="text-[0.82rem] text-[#8b8477]">Agents</p>
                      <p className="mt-1 truncate text-[0.9rem] text-[#ece5d7]">
                        {activeAgent?.name ?? (activeSession ? "Archived agent" : "No agent selected")}
                      </p>
                    </div>
                    <button
                      aria-label={isAgentListOpen ? "Hide agents" : "Show agents"}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-[#bcb4a7] transition hover:bg-white/5"
                      onClick={() => setIsAgentListOpen((current) => !current)}
                      type="button"
                    >
                      <ChevronDown
                        className={`size-4 transition-transform ${isAgentListOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-[#8f8778]">
                    <span>{agents.length} assigned</span>
                    {activeAgent?.agent_info.role ? (
                      <span className="truncate">{activeAgent.agent_info.role}</span>
                    ) : null}
                  </div>
                  {isAgentListOpen ? (
                    <div className="mt-3 min-h-0 border-t border-white/8 pt-3">
                      <div className="max-h-[34vh] space-y-1 overflow-y-auto px-2 pr-3 ht-scroll-region lg:max-h-[38vh]">
                        {agents.map((agent) => {
                          const isSelected = agent.id === sidebarSelectionAgentId;
                          const isMenuOpen = openAgentMenuId === agent.id;

                          return (
                            <div
                              key={agent.id}
                              className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition ${
                                isSelected
                                  ? "bg-[#2a2723] text-[#f1eadc]"
                                  : "text-[#b8b0a2] hover:bg-white/5"
                              }`}
                            >
                              <button
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                onClick={() => {
                                  setSelectedAgentId(agent.id);
                                  setActiveThreadId(null);
                                  setMessages([]);
                                  setOpenAgentMenuId(null);
                                  setIsAgentListOpen(false);
                                  closeMobileSidebar();
                                }}
                                type="button"
                              >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#312c27] text-[#ddd5c8]">
                                  <Bot className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[0.9rem]">{agent.name}</span>
                                  <span className="block truncate text-[11px] text-[#8f8778]">
                                    {agent.agent_info.role || "Assigned agent"} ·{" "}
                                    {agent.agent_info.workspace?.mode ?? "chat"}
                                  </span>
                                </span>
                              </button>
                              {agent.is_system ? (
                                <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f8778]">
                                  Built-in
                                </span>
                              ) : null}
                              {currentUser.is_admin ? (
                                <div
                                  className="relative shrink-0"
                                  ref={isMenuOpen ? agentMenuRef : undefined}
                                >
                                  <button
                                    aria-label={`Agent actions for ${agent.name}`}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8d8578] transition hover:bg-white/8 hover:text-[#ddd5c7]"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenAgentMenuId((current) =>
                                        current === agent.id ? null : agent.id,
                                      );
                                    }}
                                    type="button"
                                  >
                                    <MoreHorizontal className="size-4" />
                                  </button>

                                  {isMenuOpen ? (
                                    <div className="absolute right-0 top-9 z-10 min-w-36 rounded-2xl border border-white/10 bg-[#201d19] p-1 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                                      <button
                                        className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#ece4d7] transition hover:bg-white/6"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openEditAgentForm(agent);
                                        }}
                                        type="button"
                                      >
                                        Edit
                                      </button>
                                      {!agent.is_system ? (
                                        <button
                                          className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#f1b4a8] transition hover:bg-white/6 disabled:text-[#8d8578]"
                                          disabled={archivingAgentId === agent.id}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            promptArchiveAgent(agent);
                                          }}
                                          type="button"
                                        >
                                          {archivingAgentId === agent.id ? "Archiving..." : "Archive"}
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        {!isAgentsLoading && agents.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-[#8b8477]">
                            No assigned agents yet.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-[0.82rem] text-[#8b8477]">Recents</p>
                    <p className="text-xs text-[#6f685d]">{filteredSessions.length}</p>
                  </div>
                  <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 ht-scroll-region">
                    {filteredSessions.map((session) => {
                      const isActive = session.thread_id === activeThreadId;
                      const isMenuOpen = openSessionMenuId === session.thread_id;
                      const isEditing = editingSessionId === session.thread_id;

                      return (
                        <div
                          key={session.thread_id}
                          className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${
                            isActive ? "bg-[#2a2723]" : "hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="space-y-2">
                                  <input
                                    autoFocus
                                    className="w-full rounded-xl border border-white/10 bg-[#1f1d19] px-3 py-2 text-[0.9rem] text-[#eee5d7] outline-none"
                                    onChange={(event) => setEditingSessionTitle(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void renameSession(session.thread_id);
                                      }

                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        cancelRenamingSession();
                                      }
                                    }}
                                    value={editingSessionTitle}
                                  />
                                  <div className="flex items-center gap-3 text-xs">
                                    <button
                                      className="text-[#ece4d7] disabled:text-[#8d8578]"
                                      disabled={isRenamingSession || !editingSessionTitle.trim()}
                                      onClick={() => {
                                        void renameSession(session.thread_id);
                                      }}
                                      type="button"
                                    >
                                      {isRenamingSession ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      className="text-[#8d8578]"
                                      onClick={() => {
                                        cancelRenamingSession();
                                      }}
                                      type="button"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  className="w-full text-left"
                                  onClick={() => {
                                    setActiveThreadId(session.thread_id);
                                    setSelectedAgentId(
                                      activeAgentIds.has(session.agent_id)
                                        ? session.agent_id
                                        : agents[0]?.id ?? null,
                                    );
                                    setOpenSessionMenuId(null);
                                    closeMobileSidebar();
                                  }}
                                  type="button"
                                >
                                  <p className="truncate text-[0.9rem] text-[#ddd5c7]">
                                    {session.title}
                                  </p>
                                </button>
                              )}
                            </div>

                            {!isEditing ? (
                              <div
                                className="relative"
                                ref={isMenuOpen ? sessionMenuRef : undefined}
                              >
                                <button
                                  aria-label={`Session actions for ${session.title}`}
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8d8578] transition hover:bg-white/8 hover:text-[#ddd5c7]"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenSessionMenuId((current) =>
                                      current === session.thread_id ? null : session.thread_id,
                                    );
                                  }}
                                  type="button"
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>

                                {isMenuOpen ? (
                                  <div className="absolute right-0 top-9 z-10 min-w-32 rounded-2xl border border-white/10 bg-[#201d19] p-1 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                                    <button
                                      className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#ece4d7] transition hover:bg-white/6"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        startRenamingSession(session);
                                      }}
                                      type="button"
                                    >
                                      Rename
                                    </button>
                                    {currentUser.is_admin ? (
                                      <button
                                        className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#f1b4a8] transition hover:bg-white/6 disabled:text-[#8d8578]"
                                        disabled={deletingSessionId === session.thread_id}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          promptDeleteSession(session);
                                        }}
                                        type="button"
                                      >
                                        {deletingSessionId === session.thread_id
                                          ? "Deleting..."
                                          : "Delete"}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {!isSessionsLoading && filteredSessions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[#8b8477]">
                        No chats yet for this agent.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="mt-5 shrink-0 rounded-[1.5rem] border border-white/8 bg-[#22201c] px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2d2924] text-[#e6dfd1]">
                    <UserCircle2 className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9rem] text-[#ece5d7]">{currentUser.full_name}</p>
                    <p className="truncate text-xs text-[#8f8778]">{currentUser.email}</p>
                  </div>
                  <button
                    aria-label="Logout"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#ddd4c6] transition hover:bg-white/5"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    <LogOut className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="sticky top-0 z-20 border-b border-white/6 bg-[#171613]/85 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    aria-label="Toggle sidebar"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/4 text-[#d7cfbf] transition hover:bg-white/8"
                    onClick={toggleSidebar}
                    title={sidebarToggleTitle}
                    type="button"
                  >
                    {isDesktopSidebarCollapsed ? (
                      <PanelLeftOpen className="size-4" />
                    ) : (
                      <PanelLeftClose className="size-4" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.26em] text-[#8e8678]">
                      Active workspace
                    </p>
                    <div className="truncate [font-family:var(--font-display)] text-[1.3rem] leading-none tracking-[-0.03em] text-[#efe7d8] sm:text-[1.45rem]">
                      {activeAgentName}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 max-w-[52%] pt-0.5 text-right">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#8e8678]">
                    Current session
                  </p>
                  <div className="mt-1 flex items-start justify-end gap-2 text-right">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#d97757]" />
                    <h1 className="truncate [font-family:var(--font-display)] text-[1.2rem] leading-none tracking-[-0.03em] text-[#efe7d8] sm:text-[1.35rem]">
                      {greeting}
                    </h1>
                  </div>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#1f1d19]/72">
                <div
	                  ref={transcriptRef}
	                  className="min-h-0 flex-1 overflow-y-auto px-6 py-5 pb-[16rem] sm:px-10 sm:pb-[17rem] lg:px-12 ht-scroll-region"
                  onScroll={updateAutoScrollState}
                >
                  {hasConversation ? (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3.5">
                      {displayMessages.map(({ message, index }) => (
                        <article
                          key={message.id}
                          className={`rounded-[1.4rem] px-4 py-3.5 sm:px-5 ${
                            message.role === "user"
                              ? "ml-auto max-w-[84%] bg-[#2b2824] text-[#ece5d8] sm:max-w-[74%]"
                              : "mr-auto max-w-full border border-white/6 bg-[#23211d] text-[#d7d1c5] sm:max-w-[84%]"
                          }`}
                        >
                          <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-[#8e8678]">
                            {message.role}
                          </p>
                          {message.role === "assistant" ? (
                            <div className="space-y-3 text-[0.94rem] text-[#ddd7ca]">
                              {message.run ? (
                                <AgentPlan
                                  agentName={activeAgent?.name}
                                  isExpanded={message.run.isExpanded}
                                  isRunning={message.run.status === "running"}
                                  onToggleExpanded={() => toggleMessageRun(message.id)}
                                  tasks={message.run.tasks}
                                />
                              ) : null}
                              {message.content ||
                              (isSending && index === messages.length - 1 && !message.run) ? (
                                <div>
                                  {renderAssistantMarkdown(
                                    message.content ||
                                      (isSending && index === messages.length - 1 ? "..." : ""),
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap text-[0.94rem] leading-6 text-[#ddd7ca]">
                              {message.content ||
                                (isSending && index === messages.length - 1 ? "..." : "")}
                            </p>
                          )}
                        </article>
                      ))}
                      <div aria-hidden="true" className="h-px w-full" />
                    </div>
                  ) : (
                    <div className="flex min-h-full items-center justify-center py-6">
                      <div className="w-full max-w-3xl text-center transition-all duration-300 ease-out">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#2e2b26] text-[#d97757]">
                          <Sparkles className="size-6" />
                        </div>
                        <h2 className="mt-5 [font-family:var(--font-display)] text-[1.8rem] leading-[1.05] tracking-[-0.03em] text-[#e7dfd2] sm:text-[2.2rem]">
                          Start the conversation
                        </h2>
                        <p className="mx-auto mt-2.5 max-w-2xl text-[0.95rem] leading-6 text-[#938b7d]">
                          Ask for guidance, operational drafts, or agent testing. Each chat stays
                          attached to its own session so you can return later.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[linear-gradient(180deg,rgba(31,29,25,0.98)_0%,rgba(31,29,25,0.82)_38%,rgba(31,29,25,0)_100%)]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-4 sm:px-10 lg:px-12">
	                  <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,rgba(31,29,25,0)_0%,rgba(31,29,25,0.95)_48%,rgba(31,29,25,1)_100%)]" />
	                  <div className="pointer-events-auto relative mx-auto flex w-full max-w-3xl flex-col gap-3">
	                    {renderComposer("translate-y-0 opacity-100 transition-all duration-300 ease-out")}
	                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
