"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Circle, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";

interface TasksPanelProps {
  tasks: Task[];
}

export function TasksPanel({ tasks }: TasksPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;

  if (total === 0) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium hover:bg-bg-tertiary"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Tasks ({done}/{total})
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </button>

      {!collapsed && (
        <div className="max-h-48 overflow-y-auto px-4 pb-3">
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
    pending: <Circle className="h-4 w-4 text-text-secondary" />,
    in_progress: <Loader2 className="h-4 w-4 animate-spin text-accent" />,
    done: <Check className="h-4 w-4 text-success" />,
    failed: <AlertCircle className="h-4 w-4 text-error" />,
  }[task.status];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
        task.status === "done" && "text-text-secondary line-through"
      )}
    >
      <span className="mt-0.5 shrink-0">{statusIcon}</span>
      <span>{task.title}</span>
    </div>
  );
}
