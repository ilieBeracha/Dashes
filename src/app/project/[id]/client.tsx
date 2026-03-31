"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Settings, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TasksPanel } from "@/components/tasks/tasks-panel";
import { FilesPanel } from "@/components/files/files-panel";
import { PreviewPanel } from "@/components/preview/preview-panel";
import type { Message, Task } from "@/types";

interface WorkspaceClientProps {
  projectId: string;
  user: {
    id?: string;
    name?: string | null;
  };
}

export function WorkspaceClient({ projectId, user }: WorkspaceClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isAgentWorking, setIsAgentWorking] = useState(false);

  async function handleSendMessage(content: string) {
    // Add user message to chat
    const userMessage: Message = {
      id: crypto.randomUUID(),
      projectId,
      role: "user",
      content,
      metadata: {},
      toolCalls: null,
      tokenCount: null,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsAgentWorking(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        if (data.tasks) {
          setTasks(data.tasks);
        }
        if (data.files) {
          setFiles(data.files);
        }
      }
    } finally {
      setIsAgentWorking(false);
    }
  }

  async function handleDeploy() {
    setIsAgentWorking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
      }
    } finally {
      setIsAgentWorking(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">Project</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/project/${projectId}/settings`}>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          <Button size="sm" onClick={handleDeploy} disabled={isAgentWorking}>
            <Rocket className="h-4 w-4" />
            Deploy
          </Button>
        </div>
      </header>

      {/* Workspace panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Chat + Tasks */}
        <div className="flex w-[400px] shrink-0 flex-col border-r border-border">
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              isAgentWorking={isAgentWorking}
            />
          </div>
          <TasksPanel tasks={tasks} />
        </div>

        {/* Right: Files + Preview */}
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 border-r border-border">
            <FilesPanel
              files={files}
              activeFile={activeFile}
              onSelectFile={setActiveFile}
              projectId={projectId}
            />
          </div>
          <div className="w-1/2">
            <PreviewPanel projectId={projectId} />
          </div>
        </div>
      </div>
    </div>
  );
}
