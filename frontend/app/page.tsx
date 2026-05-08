"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import {
  ArrowUp,
  Bot,
  ChevronRight,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";

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

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export default function HomePage() {
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
  const [agentRole, setAgentRole] = useState("");
  const [agentGoal, setAgentGoal] = useState("");
  const [agentResponsibilities, setAgentResponsibilities] = useState("");
  const [agentPermissions, setAgentPermissions] = useState("");
  const [agentGuardrails, setAgentGuardrails] = useState("");
  const [agentWorkStyle, setAgentWorkStyle] = useState("");
  const [roleDraft, setRoleDraft] = useState("admin");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadAgents();
    void loadSessions();
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    void loadMessages(activeThreadId);
  }, [activeThreadId]);

  async function loadAgents() {
    setIsAgentsLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/agents`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load agents.");
      }

      const data = (await response.json()) as Agent[];
      setAgents(data);

      if (!selectedAgentId && data.length > 0) {
        setSelectedAgentId(data[0].id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load agents.",
      );
    } finally {
      setIsAgentsLoading(false);
    }
  }

  async function loadSessions() {
    setIsSessionsLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/sessions`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load sessions.");
      }

      const data = (await response.json()) as Session[];
      setSessions(data);

      if (!activeThreadId && data.length > 0) {
        setActiveThreadId(data[0].thread_id);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load sessions.",
      );
    } finally {
      setIsSessionsLoading(false);
    }
  }

  async function loadMessages(threadId: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/sessions/${threadId}/messages`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load messages.");
      }

      const data = (await response.json()) as ChatMessage[];
      setMessages(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load messages.",
      );
    }
  }

  async function createSession(agentId?: string) {
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: agentId ?? selectedAgentId ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session.");
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
      try {
        const response = await fetch(`${apiBaseUrl}/api/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_id: composingAgentId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create session.");
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
      const response = await fetch(`${apiBaseUrl}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thread_id: threadId,
          message: userText,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to stream assistant response.");
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
      const response = await fetch(`${apiBaseUrl}/api/agents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: agentName,
          role: agentRole,
          goal: agentGoal,
          responsibilities: agentResponsibilities,
          permissions: agentPermissions,
          guardrails: agentGuardrails,
          work_style: agentWorkStyle,
          assigned_roles: roleDraft
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create agent.");
      }

      const agent = (await response.json()) as Agent;
      setAgents((current) => [...current, agent]);
      setSelectedAgentId(agent.id);
      setAgentName("");
      setAgentRole("");
      setAgentGoal("");
      setAgentResponsibilities("");
      setAgentPermissions("");
      setAgentGuardrails("");
      setAgentWorkStyle("");
      setRoleDraft("admin");
      setIsAgentFormOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create agent.",
      );
    } finally {
      setIsCreatingAgent(false);
    }
  }

  const activeSession = sessions.find((session) => session.thread_id === activeThreadId);
  const activeAgent =
    agents.find((agent) => agent.id === activeSession?.agent_id) ??
    agents.find((agent) => agent.id === selectedAgentId) ??
    agents[0] ??
    null;

  const greeting = activeSession ? activeSession.title : "How can I help you?";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex min-h-screen flex-col border-r border-white/8 bg-[#1f1d1a] px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="[font-family:var(--font-display)] text-[2.1rem] leading-none tracking-[-0.03em]">
              HumanTouch
            </div>
          </div>

          <div className="mt-7 space-y-2">
            <button
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[1.05rem] text-[#e4ddcf] transition hover:bg-white/5"
              onClick={() => void createSession(selectedAgentId ?? undefined)}
              type="button"
            >
              <Plus className="size-5" />
              New chat
            </button>
            <button
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[1.05rem] text-[#c5bfb2] transition hover:bg-white/5"
              onClick={() => setIsAgentFormOpen((current) => !current)}
              type="button"
            >
              <WandSparkles className="size-5" />
              Create agent
            </button>
          </div>

          {isAgentFormOpen ? (
            <form
              className="mt-5 rounded-[1.6rem] border border-white/10 bg-[#26231f] p-4"
              onSubmit={handleCreateAgent}
            >
              <p className="text-xs uppercase tracking-[0.24em] text-[#9d9586]">
                New Agent
              </p>
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentName(event.target.value)}
                  placeholder="Name"
                  value={agentName}
                />
                <input
                  className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentRole(event.target.value)}
                  placeholder="Role"
                  value={agentRole}
                />
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentGoal(event.target.value)}
                  placeholder="Primary goal"
                  value={agentGoal}
                />
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentResponsibilities(event.target.value)}
                  placeholder="Responsibilities"
                  value={agentResponsibilities}
                />
                <textarea
                  className="min-h-20 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentPermissions(event.target.value)}
                  placeholder="Permissions"
                  value={agentPermissions}
                />
                <textarea
                  className="min-h-20 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentGuardrails(event.target.value)}
                  placeholder="Guardrails"
                  value={agentGuardrails}
                />
                <textarea
                  className="min-h-20 w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setAgentWorkStyle(event.target.value)}
                  placeholder="Work style"
                  value={agentWorkStyle}
                />
                <input
                  className="w-full rounded-2xl border border-white/8 bg-[#1e1b18] px-3 py-2.5 text-sm text-[#f2ede3] outline-none placeholder:text-[#7f786b]"
                  onChange={(event) => setRoleDraft(event.target.value)}
                  placeholder="Roles, comma-separated"
                  value={roleDraft}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  className="text-sm text-[#a79f91]"
                  onClick={() => setIsAgentFormOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <Button
                  className="rounded-full bg-[#f0ece4] px-4 text-[#1c1b18] hover:bg-[#fffaf0]"
                  disabled={
                    isCreatingAgent ||
                    !agentName.trim() ||
                    !agentRole.trim() ||
                    !agentGoal.trim() ||
                    !agentResponsibilities.trim() ||
                    !agentPermissions.trim() ||
                    !agentGuardrails.trim() ||
                    !agentWorkStyle.trim()
                  }
                  type="submit"
                >
                  {isCreatingAgent ? "Creating..." : "Save"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="mt-6">
            <p className="px-3 text-sm text-[#8b8477]">Agents</p>
            <div className="mt-2 space-y-1">
              {agents.map((agent) => {
                const isSelected = agent.id === (activeSession?.agent_id ?? selectedAgentId);

                return (
                  <button
                    key={agent.id}
                    className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left transition ${
                      isSelected ? "bg-[#2a2723] text-[#f1eadc]" : "text-[#b8b0a2] hover:bg-white/5"
                    }`}
                    onClick={() => setSelectedAgentId(agent.id)}
                    type="button"
                  >
                    <span className="truncate text-[0.98rem]">{agent.name}</span>
                    {agent.is_system ? (
                      <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f8778]">
                        System
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {!isAgentsLoading && agents.length === 0 ? (
                <div className="px-3 py-2 text-sm text-[#8b8477]">No agents yet.</div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <p className="px-3 text-sm text-[#8b8477]">Recents</p>
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
                    onClick={() => setActiveThreadId(session.thread_id)}
                    type="button"
                  >
                    <p className="truncate text-[1rem] text-[#ddd5c7]">{session.title}</p>
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
          </div>

          <div className="mt-5 flex items-center justify-between rounded-[1.4rem] border border-white/8 bg-[#22201c] px-4 py-3">
            <div>
              <p className="text-sm text-[#ece5d7]">Admin Console</p>
              <p className="text-xs text-[#8f8778]">Single-company control room</p>
            </div>
            <ChevronRight className="size-4 text-[#8f8778]" />
          </div>
        </aside>

        <section className="relative flex min-h-screen flex-col bg-[#1b1a17]">
          <div className="flex flex-1 flex-col">
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-8 pt-16">
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center">
                  <div className="flex items-center gap-4">
                    <Sparkles className="size-10 text-[#d97757]" />
                    <h1 className="[font-family:var(--font-display)] text-center text-[3.4rem] leading-[0.98] tracking-[-0.04em] text-[#d7d1c5] md:text-[4.7rem]">
                      {greeting}
                    </h1>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 pb-10 pt-10">
                  {messages.map((message, index) => (
                    <article
                      key={`${message.created_at}-${index}`}
                      className={`rounded-[1.75rem] px-5 py-4 ${
                        message.role === "user"
                          ? "ml-auto max-w-[80%] bg-[#2b2824] text-[#ece5d8]"
                          : "max-w-full text-[#d7d1c5]"
                      }`}
                    >
                      <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#8e8678]">
                        {message.role}
                      </p>
                      <p className="whitespace-pre-wrap text-[1.02rem] leading-8">
                        {message.content ||
                          (isSending && index === messages.length - 1 ? "..." : "")}
                      </p>
                    </article>
                  ))}
                </div>
              )}

              <div className="mx-auto w-full max-w-[64rem]">
                <PromptInput
                  value={draft}
                  onValueChange={setDraft}
                  isLoading={isSending}
                  onSubmit={() => {
                    void submitMessage();
                  }}
                  className="border-white/8 bg-[#2a2824] p-3 shadow-none"
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
                    placeholder="Type / for skills"
                    className="min-h-[5.75rem] px-3 py-3 text-[1rem] text-[#f0ebe2] placeholder:text-[#6f695f]"
                  />

                  <PromptInputActions className="items-center justify-between px-2 pt-2">
                    <div className="flex items-center gap-3 text-sm text-[#bbb4a7]">
                      <PromptInputAction tooltip="Attach files">
                        <label
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/6"
                          htmlFor="file-upload"
                        >
                          <input
                            ref={uploadInputRef}
                            id="file-upload"
                            type="file"
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          <Plus className="size-5" />
                        </label>
                      </PromptInputAction>
                      <span>{activeAgent?.name ?? "Admin"}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-sm text-[#bbb4a7]">Gemini</span>
                      <PromptInputAction
                        tooltip={isSending ? "Generating response" : "Send message"}
                      >
                        <Button
                          variant="default"
                          size="icon"
                          className="h-9 w-9 rounded-full bg-[#f1ede6] text-[#1a1916] hover:bg-[#fffaf0]"
                          disabled={isSending || !draft.trim()}
                          onClick={() => {
                            void submitMessage();
                          }}
                          type="button"
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

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <div className="rounded-full border border-white/10 px-5 py-2 text-[#d7d0c4]">
                    Code
                  </div>
                  <div className="rounded-full border border-white/10 px-5 py-2 text-[#d7d0c4]">
                    Write
                  </div>
                  <div className="rounded-full border border-white/10 px-5 py-2 text-[#d7d0c4]">
                    Agent: {activeAgent?.name ?? "Admin"}
                  </div>
                  <div className="rounded-full border border-white/10 px-5 py-2 text-[#d7d0c4]">
                    Sessions: {sessions.length}
                  </div>
                </div>

                <div className="mt-4 text-center text-sm text-[#8d8578]">
                  {error ? <span className="text-[#d97757]">{error}</span> : "Streaming over SSE"}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
