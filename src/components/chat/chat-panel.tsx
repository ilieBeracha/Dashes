"use client";

import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
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
  }, [messages, isAgentWorking]);

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
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-text-secondary">
              Describe what you want to build, or pick a template to get started.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isAgentWorking && <AgentThinking status={agentStatus} agent={activeAgent} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build or change..."
            disabled={isAgentWorking}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isAgentWorking}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Cmd+Enter to send
        </p>
      </form>
    </div>
  );
}
