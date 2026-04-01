import { Bot, Hammer, ClipboardList, Rocket } from "lucide-react";

interface AgentThinkingProps {
  status?: string;
  agent?: string | null;
}

const AGENT_META: Record<string, { label: string; icon: typeof Bot }> = {
  planner: { label: "Planner", icon: ClipboardList },
  builder: { label: "Builder", icon: Hammer },
  deploy: { label: "Deploy", icon: Rocket },
};

export function AgentThinking({ status, agent }: AgentThinkingProps) {
  const meta = agent ? AGENT_META[agent] : null;
  const Icon = meta?.icon ?? Bot;

  return (
    <div className="mb-4 flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-tertiary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="rounded-xl bg-bg-tertiary px-4 py-3">
        {meta && (
          <span className="mb-1 block text-xs font-medium text-accent">
            {meta.label}
          </span>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 animate-bounce rounded-full bg-text-secondary [animation-delay:0ms]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-text-secondary [animation-delay:150ms]" />
            <div className="h-2 w-2 animate-bounce rounded-full bg-text-secondary [animation-delay:300ms]" />
          </div>
          {status && (
            <span className="text-xs text-text-secondary">{status}</span>
          )}
        </div>
      </div>
    </div>
  );
}
