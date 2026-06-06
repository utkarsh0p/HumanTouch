"use client";

import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";

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

const statusLabels: Record<AgentPlanStatus, string> = {
  pending: "pending",
  "in-progress": "running",
  completed: "done",
  failed: "failed",
  "need-help": "needs input",
};

function StatusIcon({ status }: { status: AgentPlanStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-4 text-[#8bbf8b]" />;
  }

  if (status === "in-progress") {
    return <CircleDotDashed className="size-4 animate-spin text-[#8fb6e8]" />;
  }

  if (status === "need-help") {
    return <CircleAlert className="size-4 text-[#e0bc71]" />;
  }

  if (status === "failed") {
    return <CircleX className="size-4 text-[#e58f7e]" />;
  }

  return <Circle className="size-4 text-[#716a5f]" />;
}

function statusClass(status: AgentPlanStatus): string {
  if (status === "completed") {
    return "border-[#536b55] text-[#a8c8a6]";
  }

  if (status === "in-progress") {
    return "border-[#526982] text-[#a9c9ef]";
  }

  if (status === "need-help") {
    return "border-[#7a6a45] text-[#d2bd7a]";
  }

  if (status === "failed") {
    return "border-[#83534a] text-[#e29c8e]";
  }

  return "border-white/8 text-[#8f8778]";
}

function collectTools(tasks: AgentPlanTask[]): string[] {
  const tools = new Set<string>();

  for (const task of tasks) {
    task.tools?.forEach((tool) => tools.add(tool));
    task.subtasks.forEach((subtask) => subtask.tools?.forEach((tool) => tools.add(tool)));
  }

  return [...tools];
}

export function AgentPlan({
  agentName,
  isExpanded,
  isRunning,
  onToggleExpanded,
  tasks,
}: AgentPlanProps) {
  const reduceMotion = useReducedMotion();
  const visibleTasks = tasks.length > 0 ? tasks : [];

  if (visibleTasks.length === 0) {
    return null;
  }

  const toolNames = collectTools(visibleTasks);
  const shouldShowTimeline = isRunning || isExpanded;
  const stateLabel = isRunning ? "running" : "complete";
  const summary =
    toolNames.length > 0
      ? `${visibleTasks.length} steps · ${toolNames.length} tools`
      : `${visibleTasks.length} steps`;

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 overflow-hidden rounded-xl border border-white/8 bg-[#1c1a17]/70 text-[#ddd7ca]"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.24 }}
    >
      <button
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
        onClick={onToggleExpanded}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusIcon status={isRunning ? "in-progress" : "completed"} />
          <div className="min-w-0">
            <p className="truncate text-xs text-[#f0e8dc]">
              Agent work {stateLabel}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[#8f8778]">
              {agentName ? `${agentName} · ${summary}` : summary}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {toolNames.slice(0, 2).map((tool) => (
            <span
              className="hidden rounded-full border border-white/8 px-2 py-0.5 text-[10px] text-[#a9a195] sm:inline"
              key={tool}
            >
              {tool}
            </span>
          ))}
          <ChevronDown
            className={`size-4 text-[#9f9788] transition ${
              shouldShowTimeline ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {shouldShowTimeline ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="border-t border-white/6"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.2 }}
          >
            <LayoutGroup>
              <ul className="max-h-64 space-y-1 overflow-y-auto px-3 py-2.5 ht-scroll-region">
                <AnimatePresence initial={false}>
                  {visibleTasks.map((task) => (
                    <motion.li
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg px-1.5 py-1.5"
                      exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                      key={task.id}
                      layout
                      transition={{ duration: reduceMotion ? 0.12 : 0.2 }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 shrink-0">
                          <StatusIcon status={task.status} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <p className="truncate text-sm text-[#f0e8dc]">{task.title}</p>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusClass(
                                task.status,
                              )}`}
                            >
                              {statusLabels[task.status]}
                            </span>
                          </div>
                          {task.description ? (
                            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#948d80]">
                              {task.description}
                            </p>
                          ) : null}
                          {task.tools && task.tools.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {task.tools.map((tool) => (
                                <span
                                  className="rounded-full border border-white/8 bg-[#1d1b18] px-2 py-0.5 text-[10px] text-[#a9a195]"
                                  key={tool}
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {task.subtasks.length > 0 ? (
                            <ul className="mt-2 space-y-1 border-l border-dashed border-white/10 pl-3">
                              {task.subtasks.map((subtask) => (
                                <motion.li
                                  animate={{ opacity: 1, x: 0 }}
                                  className="flex items-start gap-2 rounded-lg py-1"
                                  initial={{ opacity: 0, x: reduceMotion ? 0 : -6 }}
                                  key={subtask.id}
                                  layout
                                  transition={{ duration: reduceMotion ? 0.12 : 0.18 }}
                                >
                                  <span className="mt-0.5 shrink-0">
                                    <StatusIcon status={subtask.status} />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs text-[#d8d1c4]">
                                      {subtask.title}
                                    </p>
                                    {subtask.description ? (
                                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#8f8778]">
                                        {subtask.description}
                                      </p>
                                    ) : null}
                                    {subtask.tools && subtask.tools.length > 0 ? (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {subtask.tools.map((tool) => (
                                          <span
                                            className="rounded-full border border-white/8 px-1.5 py-0.5 text-[10px] text-[#a9a195]"
                                            key={tool}
                                          >
                                            {tool}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </motion.li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </LayoutGroup>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
