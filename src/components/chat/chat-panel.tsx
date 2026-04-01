"use client";

import { useRef, useEffect, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { AgentThinking } from "./agent-thinking";
import type { Message } from "@/types";

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isAgentWorking: boolean;
  agentStatus?: string;
  activeAgent?: string | null;
}

export function ChatPanel({
  messages,
  onSendMessage,
  isAgentWorking,
  agentStatus,
  activeAgent,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAgentWorking, agentStatus]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isAgentWorking) return;
    onSendMessage(input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <p className="text-center text-sm text-text-secondary">
              Describe what you want to build, or pick a template to get
              started.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isAgentWorking && (
          <AgentThinking status={agentStatus} agent={activeAgent} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-bg-secondary/50 p-2.5 sm:p-3"
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isAgentWorking
                ? "Agent is working..."
                : "Describe what you want to build or change..."
            }
            disabled={isAgentWorking}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || isAgentWorking}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg bg-accent text-white transition-all hover:bg-accent/90 active:scale-95 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 hidden text-xs text-text-secondary sm:block">
          Cmd+Enter to send
        </p>
      </form>
    </div>
  );
}
