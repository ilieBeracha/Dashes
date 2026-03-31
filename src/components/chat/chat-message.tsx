import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import type { Message } from "@/types";

interface ChatMessageProps {
  message: Message;
}

const ROLE_CONFIG = {
  user: { label: "You", icon: User, align: "right" as const },
  planner: { label: "Planner", icon: Bot, align: "left" as const },
  builder: { label: "Builder", icon: Bot, align: "left" as const },
  deploy: { label: "Deploy", icon: Bot, align: "left" as const },
  system: { label: "System", icon: Bot, align: "left" as const },
} as const;

export function ChatMessage({ message }: ChatMessageProps) {
  const config = ROLE_CONFIG[message.role] ?? ROLE_CONFIG.system;
  const isUser = message.role === "user";

  return (
    <div
      className={cn("mb-4 flex gap-3", {
        "flex-row-reverse": isUser,
      })}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-accent" : "bg-bg-tertiary"
        )}
      >
        <config.icon className="h-4 w-4" />
      </div>

      <div
        className={cn("max-w-[80%] rounded-xl px-4 py-2.5", {
          "bg-accent text-white": isUser,
          "bg-bg-tertiary": !isUser,
        })}
      >
        {!isUser && (
          <span className="mb-1 block text-xs font-medium text-text-secondary">
            {config.label}
          </span>
        )}
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
      </div>
    </div>
  );
}
