import { Bot } from "lucide-react";

interface AgentThinkingProps {
  status?: string;
}

export function AgentThinking({ status }: AgentThinkingProps) {
  return (
    <div className="mb-4 flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-tertiary">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-xl bg-bg-tertiary px-4 py-3">
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
