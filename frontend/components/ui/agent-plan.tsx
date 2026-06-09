"use client";

import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Globe,
  HardDrive,
  Link2,
  Mail,
  Search,
  Sparkles,
  Wrench,
  Zap,
  GitBranch,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export type AgentPlanStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "failed"
  | "need-help";

export type AgentPlanSubtask = {
  id: string;
  title: string;
  description?: string;
  status: AgentPlanStatus;
  tools?: string[];
};

export type AgentPlanTask = {
  id: string;
  title: string;
  description?: string;
  status: AgentPlanStatus;
  tools?: string[];
  subtasks: AgentPlanSubtask[];
};

type AgentPlanProps = {
  agentName?: string;
  isExpanded: boolean;
  isRunning: boolean;
  onToggleExpanded: () => void;
  tasks: AgentPlanTask[];
};

type StepInfo = {
  icon: ReactNode;
  presentLabel: string;
  pastLabel: string;
  isMetaTool: boolean;
};

// These are Composio infrastructure tools — hide them from the timeline
const HIDDEN_TOOLS = new Set([
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_GET_TOOL_SCHEMAS",
]);

const META_TOOL_IDS = new Set([
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_REMOTE_WORKBENCH",
  "COMPOSIO_REMOTE_BASH_TOOL",
]);

function getStepInfo(toolName: string): StepInfo {
  const name = (toolName ?? "").toUpperCase();
  const isMeta = META_TOOL_IDS.has(name);

  if (name === "COMPOSIO_SEARCH_TOOLS") {
    return { icon: <Search className="size-3.5" />, presentLabel: "Searching available tools", pastLabel: "Searched available tools", isMetaTool: true };
  }
  if (name === "COMPOSIO_REMOTE_WORKBENCH") {
    return { icon: <Zap className="size-3.5" />, presentLabel: "Running code", pastLabel: "Ran code", isMetaTool: true };
  }
  if (name === "COMPOSIO_REMOTE_BASH_TOOL") {
    return { icon: <Zap className="size-3.5" />, presentLabel: "Running shell command", pastLabel: "Ran shell command", isMetaTool: true };
  }
  if (name === "COMPOSIO_MANAGE_CONNECTIONS") {
    return { icon: <Link2 className="size-3.5" />, presentLabel: "Connecting account", pastLabel: "Generated connection link", isMetaTool: false };
  }
  if (name.startsWith("TAVILY")) {
    return { icon: <Globe className="size-3.5" />, presentLabel: "Searching the web", pastLabel: "Searched the web", isMetaTool: false };
  }
  if (name.startsWith("GMAIL")) {
    return { icon: <Mail className="size-3.5" />, presentLabel: "Using Gmail", pastLabel: "Used Gmail", isMetaTool: false };
  }
  if (name.startsWith("GITHUB")) {
    return { icon: <GitBranch className="size-3.5" />, presentLabel: "Using GitHub", pastLabel: "Used GitHub", isMetaTool: false };
  }
  if (name.startsWith("GOOGLECALENDAR")) {
    return { icon: <Calendar className="size-3.5" />, presentLabel: "Using Google Calendar", pastLabel: "Used Google Calendar", isMetaTool: false };
  }
  if (name.startsWith("GOOGLEDRIVE")) {
    return { icon: <HardDrive className="size-3.5" />, presentLabel: "Using Google Drive", pastLabel: "Used Google Drive", isMetaTool: false };
  }
  return { icon: <Wrench className="size-3.5" />, presentLabel: toolName, pastLabel: toolName, isMetaTool: isMeta };
}

type FlatStep = {
  id: string;
  toolName: string;
  info: StepInfo;
  status: AgentPlanStatus;
};

function extractSteps(tasks: AgentPlanTask[]): FlatStep[] {
  const steps: FlatStep[] = [];

  const genResponse = tasks.find((t) => t.id === "generate-response");
  if (genResponse?.status === "in-progress") {
    steps.push({
      id: "thinking",
      toolName: "thinking",
      info: {
        icon: <ThinkingIndicator />,
        presentLabel: "Thinking…",
        pastLabel: "Thought",
        isMetaTool: true,
      },
      status: "in-progress",
    });
  }

  const runToolsTask = tasks.find((t) => t.id === "run-tools");
  if (runToolsTask) {
    const toolSteps = runToolsTask.subtasks
      .filter((s) => {
        if (s.status === "pending") return false;
        const toolName = (s.tools?.[0] ?? s.title).toUpperCase();
        return !HIDDEN_TOOLS.has(toolName);
      })
      .map((s) => {
        const toolName = s.tools?.[0] ?? s.title;
        return {
          id: s.id,
          toolName,
          info: getStepInfo(toolName),
          status: s.status,
        };
      });
    steps.push(...toolSteps);
  }

  return steps;
}

function getCurrentActionLabel(tasks: AgentPlanTask[], steps: FlatStep[]): string {
  const inProgress = steps.find((s) => s.status === "in-progress");
  if (inProgress && inProgress.id !== "thinking") return inProgress.info.presentLabel;

  const loadTools = tasks.find((t) => t.id === "load-tools");
  if (loadTools?.status === "in-progress") return "Preparing…";

  return "Working…";
}

function buildSummary(steps: FlatStep[]): string {
  const completed = steps.filter((s) => s.status === "completed");
  const unique = [...new Set(completed.map((s) => s.info.pastLabel))];
  if (unique.length === 0) return "Agent work";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]}, ${unique[1]} +${unique.length - 2} more`;
}

function PulsingDot() {
  return (
    <span className="relative flex size-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8fb6e8] opacity-60" />
      <span className="relative inline-flex size-1.5 rounded-full bg-[#8fb6e8]" />
    </span>
  );
}

function ThinkingIndicator() {
  return <span className="size-2.5 rounded-full bg-white" />;
}

export function AgentPlan({
  isExpanded,
  isRunning,
  onToggleExpanded,
  tasks,
}: AgentPlanProps) {
  const reduceMotion = useReducedMotion();
  const steps = extractSteps(tasks);
  const hasAnyWork = steps.length > 0;

  if (!hasAnyWork && !isRunning) return null;

  const currentActionLabel = getCurrentActionLabel(tasks, steps);
  const summary = buildSummary(steps);
  const showTimeline = isRunning || isExpanded;

  return (
    <div className="mb-2">
      {/* Header row */}
      <button
        className="group flex items-center gap-1.5 py-0.5 text-left"
        onClick={onToggleExpanded}
        type="button"
      >
        {isRunning ? (
          <>
            <motion.span
              animate={{ rotate: 360 }}
              className="text-[#d97757]"
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="size-3.5" />
            </motion.span>
            <span className="text-sm font-medium text-[#ddd7ca]">Working</span>
            <span className="mx-0.5 text-[#4a4640]">·</span>
            <span className="text-xs text-[#7a7368]">{currentActionLabel}</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-3.5 text-[#6aaa6a]" />
            <span className="text-sm text-[#a8a098]">{summary}</span>
            <ChevronDown
              className={`size-3.5 text-[#5a5650] transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {/* Timeline */}
      <AnimatePresence initial={false}>
        {showTimeline && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.2 }}
          >
            <div className="mt-2 pl-0.5">
              <AnimatePresence initial={false}>
                {steps.map((step, i) => {
                  const isLast = i === steps.length - 1 && !isRunning;
                  const isDone = step.status === "completed";
                  const isFailed = step.status === "failed";
                  const isActive = step.status === "in-progress";

                  return (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="relative flex gap-3"
                      exit={{ opacity: 0 }}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                      key={step.id}
                      transition={{ duration: 0.18 }}
                    >
                      {/* Icon + vertical line */}
                      <div className="relative flex shrink-0 flex-col items-center">
                        <span
                          className={`mt-[3px] ${
                            isDone
                              ? "text-[#6aaa6a]"
                              : isFailed
                                ? "text-[#e58f7e]"
                                : isActive
                                  ? "text-[#7aaee8]"
                                  : "text-[#5a5650]"
                          }`}
                        >
                          {step.info.icon}
                        </span>
                        {!isLast && (
                          <motion.span
                            animate={{ scaleY: 1 }}
                            className="mt-1 w-px flex-1 bg-white/[0.08]"
                            initial={{ scaleY: 0 }}
                            style={{ minHeight: "1.25rem", transformOrigin: "top" }}
                            transition={{ duration: 0.35, ease: "easeOut" }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 pb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs ${
                              isDone
                                ? "text-[#b0a898]"
                                : isFailed
                                  ? "text-[#e29c8e]"
                                  : "text-[#c8c0b4]"
                            }`}
                          >
                            {isDone ? step.info.pastLabel : step.info.presentLabel}
                          </span>
                          {isActive && <PulsingDot />}
                          {isFailed && (
                            <span className="rounded border border-[#83534a]/60 px-1.5 py-px text-[10px] text-[#e29c8e]">
                              failed
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Done row */}
              <AnimatePresence>
                {!isRunning && steps.length > 0 && (
                  <motion.div
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CheckCircle2 className="mt-[2px] size-3.5 shrink-0 text-[#6aaa6a]" />
                    <span className="text-xs text-[#6a6460]">Done</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
