"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  LogOut,
  Menu,
  PanelLeftClose,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  UserCircle2,
  WandSparkles,
  X,
} from "lucide-react";

import { AuthSwitch } from "@/components/ui/auth-switch";
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
  created_at: string;
  updated_at: string;
  assigned_roles: string[];
  assigned_user_ids: string[];
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type AuthenticatedUser = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role_key: string;
  is_admin: boolean;
};

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

export default function HomePage() {
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
  const [roleDraft, setRoleDraft] = useState("");
  const [employeeEmailDraft, setEmployeeEmailDraft] = useState("");
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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

  function resetWorkspace() {
    setAgents([]);
    setSelectedAgentId(null);
    setSessions([]);
    setActiveThreadId(null);
    setMessages([]);
    setDraft("");
    setFiles([]);
    setIsAgentFormOpen(false);
    setIsMobileSidebarOpen(false);
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

  function resetCreateAgentForm() {
    setAgentName("");
    setAgentPurpose("");
    setAgentAllowedTasks("");
    setAgentRestrictions("");
    setRoleDraft("");
    setEmployeeEmailDraft("");
  }

  function formatRoleLabel(roleKey: string) {
    if (!roleKey) {
      return "";
    }

    return roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
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

      const data = (await response.json()) as { user: AuthenticatedUser };
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

      if (!selectedAgentId && data.length > 0) {
        setSelectedAgentId(data[0].id);
      }
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

      const data = (await response.json()) as ChatMessage[];
      setMessages(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load messages.");
    }
  }

  async function handleLogin(values: { email: string; password: string }) {
    setIsAuthSubmitting(true);
    setError(null);

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
    setDraft("");
    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: userText,
        created_at: new Date().toISOString(),
      },
      {
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      },
    ]);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          applySseFrame(frame);
        }
      }

      await loadSessions();
      if (threadId) {
        await loadMessages(threadId);
      }
      setFiles([]);
    } catch (streamError) {
      setError(
        streamError instanceof Error
          ? streamError.message
          : "Failed to stream assistant response.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  function applySseFrame(frame: string) {
    const lines = frame.split("\n");
    let eventName = "message";
    let payload = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      }

      if (line.startsWith("data:")) {
        payload += line.slice(5).trim();
      }
    }

    if (!payload) {
      return;
    }

    if (eventName === "token") {
      const parsed = JSON.parse(payload) as { text: string };
      setMessages((current) => {
        const next = [...current];
        const lastIndex = next.length - 1;

        if (lastIndex < 0) {
          return next;
        }

        const lastMessage = next[lastIndex];
        next[lastIndex] = {
          ...lastMessage,
          content: `${lastMessage.content}${parsed.text}`,
        };

        return next;
      });
    }
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

  async function handleCreateAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsCreatingAgent(true);

    try {
      const response = await apiFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: agentName,
          purpose: agentPurpose,
          allowed_tasks: agentAllowedTasks,
          restrictions: agentRestrictions,
          assigned_role_keys: roleDraft
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean),
          assigned_user_emails: employeeEmailDraft
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseError(response, "Failed to create agent."));
      }

      const agent = (await response.json()) as Agent;
      setAgents((current) => [...current, agent]);
      setSelectedAgentId(agent.id);
      resetCreateAgentForm();
      setIsAgentFormOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create agent.");
    } finally {
      setIsCreatingAgent(false);
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
  const workspaceLabel = currentUser.is_admin ? "Admin workspace" : "Employee workspace";
  const workspaceSummary = currentUser.is_admin
    ? "Manage agents, test prompts, and review sessions from one place."
    : "Chat with the agents assigned to you and keep each session separate.";
  const sidebarToggleTitle = isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  const userRoleLabel = currentUser.is_admin ? "Admin" : formatRoleLabel(currentUser.role_key);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(217,119,87,0.14),_transparent_28%),linear-gradient(180deg,_#1b1a17_0%,_#171511_100%)] text-foreground">
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

        {isMobileSidebarOpen ? (
          <button
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-black/55 lg:hidden"
            onClick={closeMobileSidebar}
            type="button"
          />
        ) : null}

        <div className="relative flex min-h-screen">
          <aside
            className={`fixed inset-y-0 left-0 z-40 flex w-[19.5rem] max-w-[86vw] flex-col border-r border-white/8 bg-[#1d1b18]/96 px-4 py-4 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 lg:static lg:max-w-none lg:shadow-none ${
              isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
            } ${
              isDesktopSidebarCollapsed
                ? "lg:w-0 lg:min-w-0 lg:translate-x-0 lg:overflow-hidden lg:border-r-0 lg:px-0 lg:py-0 lg:opacity-0 lg:pointer-events-none"
                : "lg:w-[20.5rem] lg:translate-x-0 lg:opacity-100"
            }`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-white/8 px-1 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[#9d9586]">
                    HumanTouch
                  </p>
                  <div className="mt-2 [font-family:var(--font-display)] text-[2rem] leading-none tracking-[-0.04em] text-[#f0e8da]">
                    Workspace
                  </div>
                  <p className="mt-2 text-sm text-[#91897d]">{workspaceLabel}</p>
                </div>
                <button
                  aria-label={sidebarToggleTitle}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-[#c9c1b4] transition hover:bg-white/5"
                  onClick={toggleSidebar}
                  type="button"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-2">
                <button
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[#26231f] px-4 py-3 text-left text-[1rem] text-[#ede6d9] transition hover:bg-[#2d2925]"
                  onClick={() => {
                    void createSession(selectedAgentId ?? undefined);
                    closeMobileSidebar();
                  }}
                  type="button"
                >
                  <Plus className="size-5" />
                  New chat
                </button>
                {currentUser.is_admin ? (
                  <button
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-[1rem] text-[#c6bfb2] transition hover:bg-white/5"
                    onClick={() => setIsAgentFormOpen((current) => !current)}
                    type="button"
                  >
                    <WandSparkles className="size-5" />
                    {isAgentFormOpen ? "Close agent form" : "Create agent"}
                  </button>
                ) : null}
              </div>

              {currentUser.is_admin && isAgentFormOpen ? (
                <form
                  className="mt-5 rounded-[1.8rem] border border-white/10 bg-[#26231f] p-4"
                  onSubmit={handleCreateAgent}
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-[#9d9586]">New Agent</p>
                  <div className="mt-3 space-y-3">
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
                    <input
                      className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                      onChange={(event) => setRoleDraft(event.target.value)}
                      placeholder="Assign to employee roles, optional"
                      value={roleDraft}
                    />
                    <input
                      className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                      onChange={(event) => setEmployeeEmailDraft(event.target.value)}
                      placeholder="Assign to employee emails, optional"
                      value={employeeEmailDraft}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      className="text-sm text-[#a79f91]"
                      onClick={() => {
                        resetCreateAgentForm();
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
                      {isCreatingAgent ? "Creating..." : "Save"}
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
                <section>
                  <div className="flex items-center justify-between px-2">
                    <p className="text-sm text-[#8b8477]">Agents</p>
                    <p className="text-xs text-[#6f685d]">{agents.length}</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    {agents.map((agent) => {
                      const isSelected = agent.id === sidebarSelectionAgentId;

                      return (
                        <button
                          key={agent.id}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                            isSelected
                              ? "bg-[#2a2723] text-[#f1eadc]"
                              : "text-[#b8b0a2] hover:bg-white/5"
                          }`}
                          onClick={() => {
                            setSelectedAgentId(agent.id);
                            setActiveThreadId(null);
                            setMessages([]);
                            closeMobileSidebar();
                          }}
                          type="button"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#312c27] text-[#ddd5c8]">
                            <Bot className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.98rem]">{agent.name}</span>
                            <span className="block truncate text-xs text-[#8f8778]">
                              {agent.agent_info.role || "Assigned agent"} ·{" "}
                              {agent.agent_info.workspace?.mode ?? "chat"}
                            </span>
                          </span>
                          {agent.is_system ? (
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f8778]">
                              System
                            </span>
                          ) : null}
                        </button>
                      );
                    })}

                    {!isAgentsLoading && agents.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[#8b8477]">
                        No assigned agents yet.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="mt-6">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-sm text-[#8b8477]">Recents</p>
                    <p className="text-xs text-[#6f685d]">{sessions.length}</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    {sessions.map((session) => {
                      const isActive = session.thread_id === activeThreadId;
                      const sessionAgent = agents.find((agent) => agent.id === session.agent_id);

                      return (
                        <button
                          key={session.thread_id}
                          className={`w-full rounded-2xl px-3 py-3 text-left transition ${
                            isActive ? "bg-[#2a2723]" : "hover:bg-white/5"
                          }`}
                          onClick={() => {
                            setActiveThreadId(session.thread_id);
                            setSelectedAgentId(session.agent_id);
                            closeMobileSidebar();
                          }}
                          type="button"
                        >
                          <p className="truncate text-[0.98rem] text-[#ddd5c7]">{session.title}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-[#8d8578]">
                            <span>{sessionAgent?.name ?? "agent"}</span>
                            <span>·</span>
                            <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                          </div>
                        </button>
                      );
                    })}

                    {!isSessionsLoading && sessions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[#8b8477]">
                        No chats yet. Start one.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-[#22201c] px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2d2924] text-[#e6dfd1]">
                    <UserCircle2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#ece5d7]">{currentUser.full_name}</p>
                    <p className="truncate text-xs text-[#8f8778]">{currentUser.email}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#1b1916] px-3 py-2.5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#8f8778]">
                      {currentUser.is_admin ? "Admin" : "Employee"}
                    </p>
                    <p className="text-sm text-[#cfc7ba]">{userRoleLabel}</p>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-[#ddd4c6] transition hover:bg-white/5"
                    onClick={() => void handleLogout()}
                    type="button"
                  >
                    <LogOut className="size-4" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <section className="relative flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-white/6 bg-[#171613]/85 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    aria-label="Toggle sidebar"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/4 text-[#d7cfbf] transition hover:bg-white/8"
                    onClick={toggleSidebar}
                    title={sidebarToggleTitle}
                    type="button"
                  >
                    <Menu className="size-5" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.26em] text-[#8e8678]">
                      Active workspace
                    </p>
                    <div className="truncate [font-family:var(--font-display)] text-[1.75rem] leading-none tracking-[-0.04em] text-[#efe7d8] sm:text-[2rem]">
                      {activeAgent?.name ?? "Choose an agent"}
                    </div>
                  </div>
                </div>

                <div className="hidden items-center gap-2 sm:flex">
                  <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-[#d7d0c4]">
                    {currentUser.is_admin ? "Admin mode" : "Employee mode"}
                  </div>
                  <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-[#a79f91]">
                    {sessions.length} sessions
                  </div>
                </div>
              </div>
            </header>

            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
              <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="rounded-[1.75rem] border border-white/8 bg-[#211f1b]/90 px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[#8e8678]">
                    Current session
                  </p>
                  <div className="mt-2 flex items-start gap-3">
                    <Sparkles className="mt-1 size-5 shrink-0 text-[#d97757]" />
                    <div>
                      <h1 className="[font-family:var(--font-display)] text-[2rem] leading-[1.02] tracking-[-0.04em] text-[#efe7d8] sm:text-[2.5rem]">
                        {greeting}
                      </h1>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#938b7d]">
                        {workspaceSummary}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-[1.6rem] border border-white/8 bg-[#211f1b]/80 px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[#8e8678]">
                      Role
                    </p>
                    <p className="mt-2 text-lg text-[#ece4d7]">{userRoleLabel}</p>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/8 bg-[#1f1d19]/88 shadow-[0_35px_100px_rgba(0,0,0,0.24)]">
                <div className="border-b border-white/8 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-[#ada596]">
                    <span className="rounded-full bg-[#2c2924] px-3 py-1.5 text-[#ddd6ca]">
                      Agent: {activeAgent?.name ?? "Unassigned"}
                    </span>
                    <span className="rounded-full bg-[#2c2924] px-3 py-1.5 text-[#ddd6ca]">
                      {messages.length} messages
                    </span>
                    <span className="rounded-full bg-[#2c2924] px-3 py-1.5 text-[#ddd6ca]">
                      {currentUser.full_name}
                    </span>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                  {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2e2b26] text-[#d97757]">
                        <Sparkles className="size-7" />
                      </div>
                      <h2 className="mt-6 [font-family:var(--font-display)] text-[2.1rem] leading-[1.02] tracking-[-0.04em] text-[#e7dfd2] sm:text-[3rem]">
                        Start the conversation
                      </h2>
                      <p className="mt-3 max-w-xl text-sm leading-7 text-[#938b7d]">
                        Ask for guidance, operational drafts, or agent testing. Each chat stays
                        attached to its own session so you can return later.
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                      {messages.map((message, index) => (
                        <article
                          key={`${message.created_at}-${index}`}
                          className={`rounded-[1.75rem] px-4 py-4 sm:px-5 ${
                            message.role === "user"
                              ? "ml-auto max-w-[88%] bg-[#2b2824] text-[#ece5d8] sm:max-w-[78%]"
                              : "mr-auto max-w-full border border-white/6 bg-[#23211d] text-[#d7d1c5] sm:max-w-[88%]"
                          }`}
                        >
                          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#8e8678]">
                            {message.role}
                          </p>
                          <p className="whitespace-pre-wrap text-[0.98rem] leading-7 sm:text-[1.02rem] sm:leading-8">
                            {message.content ||
                              (isSending && index === messages.length - 1 ? "..." : "")}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/8 px-3 py-3 sm:px-4">
                  <PromptInput
                    className="border-white/8 bg-[#2a2824] p-3 shadow-none"
                    isLoading={isSending}
                    onSubmit={() => {
                      void submitMessage();
                    }}
                    onValueChange={setDraft}
                    value={draft}
                  >
                    {files.length > 0 ? (
                      <div className="flex flex-wrap gap-2 px-1 pb-3">
                        {files.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center gap-2 rounded-2xl bg-[#37332d] px-3 py-2 text-sm text-[#ddd5c8]"
                          >
                            <Paperclip className="size-4" />
                            <span className="max-w-[160px] truncate">{file.name}</span>
                            <button
                              className="rounded-full p-1 transition hover:bg-white/10"
                              onClick={() => removeFile(index)}
                              type="button"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <PromptInputTextarea
                      className="min-h-[5rem] px-3 py-3 text-[1rem] text-[#f0ebe2] placeholder:text-[#6f695f] sm:min-h-[5.75rem]"
                      placeholder="Ask something about your work, your agents, or the current task..."
                    />

                    <PromptInputActions className="flex-col items-stretch gap-3 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3 text-sm text-[#bbb4a7]">
                        <PromptInputAction tooltip="Attach files">
                          <label
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/6"
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
                            <Plus className="size-5" />
                          </label>
                        </PromptInputAction>
                        <span className="truncate">{activeAgent?.name ?? "No agent selected"}</span>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <PromptInputAction
                          tooltip={isSending ? "Generating response" : "Send message"}
                        >
                          <Button
                            className="h-10 w-10 rounded-full bg-[#f1ede6] text-[#1a1916] hover:bg-[#fffaf0]"
                            disabled={isSending || !draft.trim() || agents.length === 0}
                            onClick={() => {
                              void submitMessage();
                            }}
                            size="icon"
                            type="button"
                            variant="default"
                          >
                            {isSending ? (
                              <Square className="size-4 fill-current" />
                            ) : (
                              <ArrowUp className="size-4" />
                            )}
                          </Button>
                        </PromptInputAction>
                      </div>
                    </PromptInputActions>
                  </PromptInput>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                    <div className="rounded-full border border-white/10 px-4 py-2 text-[#d7d0c4]">
                      {currentUser.is_admin ? "Admin mode" : "Employee mode"}
                    </div>
                    <div className="rounded-full border border-white/10 px-4 py-2 text-[#d7d0c4]">
                      Role: {userRoleLabel}
                    </div>
                    <div className="rounded-full border border-white/10 px-4 py-2 text-[#d7d0c4]">
                      Sessions: {sessions.length}
                    </div>
                  </div>

                  <div className="mt-4 text-sm text-[#8d8578]">
                    {error ? <span className="text-[#d97757]">{error}</span> : "Streaming over SSE"}
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
