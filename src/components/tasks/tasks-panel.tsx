"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Circle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

interface TasksPanelProps {
  tasks: Task[];
}

export function TasksPanel({ tasks }: TasksPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const total = tasks.length;

  if (total === 0) return null;

  const pct = total > 0 ? (done / total) * 100 : 0;
  const allDone = done === total;

  return (
    <div className="shrink-0 border-t border-border bg-bg-secondary/50">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-bg-tertiary sm:px-4"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
          )}
          <span className="text-xs">
            Tasks{" "}
            <span className="text-text-secondary">
              ({done}/{total})
            </span>
          </span>
          {inProgress > 0 && (
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
          )}
        </div>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-tertiary sm:w-24">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone ? "bg-success" : "bg-accent"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {!collapsed && (
        <div className="max-h-40 overflow-y-auto px-3 pb-2 sm:px-4 sm:pb-3">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskItem({ task }: { task: Task }) {
  const statusIcon = {
    pending: <Circle className="h-3.5 w-3.5 text-text-secondary" />,
    in_progress: <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />,
    done: <Check className="h-3.5 w-3.5 text-success" />,
    failed: <AlertCircle className="h-3.5 w-3.5 text-error" />,
  }[task.status];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1 text-xs transition-colors",
        task.status === "done" && "text-text-secondary line-through opacity-60",
        task.status === "in_progress" && "bg-accent/5"
      )}
    >
      <span className="mt-0.5 shrink-0">{statusIcon}</span>
      <span className="leading-relaxed">{task.title}</span>
    </div>
  );
}
