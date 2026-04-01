import { cn } from "@/lib/utils";
import { User, ClipboardList, Hammer, Rocket, AlertCircle } from "lucide-react";
import type { Message } from "@/types";

interface ChatMessageProps {
  message: Message;
}

const ROLE_CONFIG = {
  user: { label: "You", icon: User, color: "bg-accent" },
  planner: { label: "Planner", icon: ClipboardList, color: "bg-bg-tertiary" },
  builder: { label: "Builder", icon: Hammer, color: "bg-bg-tertiary" },
  deploy: { label: "Deploy", icon: Rocket, color: "bg-bg-tertiary" },
  system: { label: "System", icon: AlertCircle, color: "bg-error/20" },
} as const;

export function ChatMessage({ message }: ChatMessageProps) {
  const config = ROLE_CONFIG[message.role] ?? ROLE_CONFIG.system;
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Skip rendering empty messages
  if (!message.content?.trim()) return null;

  return (
    <div
      className={cn("mb-3 flex gap-2.5", {
        "flex-row-reverse": isUser,
      })}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          config.color
        )}
      >
        <config.icon className={cn("h-3.5 w-3.5", isUser && "text-white")} />
      </div>

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[80%]",
          {
            "bg-accent text-white": isUser,
            "bg-bg-tertiary": !isUser && !isSystem,
            "border border-error/30 bg-error/10": isSystem,
          }
        )}
      >
        {!isUser && (
          <span
            className={cn(
              "mb-0.5 block text-[11px] font-medium",
              isSystem ? "text-error" : "text-text-secondary"
            )}
          >
            {config.label}
          </span>
        )}
        <div className="whitespace-pre-wrap text-[13px] leading-relaxed">
          <FormattedText text={message.content} />
        </div>
      </div>
    </div>
  );
}

/** Render simple markdown bold (**text**) as <strong> */
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
