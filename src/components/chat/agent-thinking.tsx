import { Bot, Hammer, ClipboardList, Rocket } from "lucide-react";

interface AgentThinkingProps {
  status?: string;
  agent?: string | null;
}

const AGENT_META: Record<
  string,
  { label: string; icon: typeof Bot; color: string }
> = {
  planner: { label: "Planner", icon: ClipboardList, color: "text-blue-400" },
  builder: { label: "Builder", icon: Hammer, color: "text-emerald-400" },
  deploy: { label: "Deploy", icon: Rocket, color: "text-amber-400" },
};

export function AgentThinking({ status, agent }: AgentThinkingProps) {
  const meta = agent ? AGENT_META[agent] : null;
  const Icon = meta?.icon ?? Bot;

  return (
    <div className="mb-3 flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-tertiary">
        <Icon className={`h-3.5 w-3.5 ${meta?.color ?? ""}`} />
      </div>
      <div className="rounded-2xl bg-bg-tertiary px-3.5 py-2.5">
        {meta && (
          <span
            className={`mb-1 block text-[11px] font-semibold ${meta.color}`}
          >
            {meta.label}
          </span>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:300ms]" />
          </div>
          {status && (
            <span className="max-w-[200px] truncate text-xs text-text-secondary">
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
