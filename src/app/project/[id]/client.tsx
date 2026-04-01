"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Settings,
  Rocket,
  MessageSquare,
  FolderOpen,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TasksPanel } from "@/components/tasks/tasks-panel";
import { FilesPanel } from "@/components/files/files-panel";
import { PreviewPanel } from "@/components/preview/preview-panel";
import type { Message, Task } from "@/types";

type MobileTab = "chat" | "files" | "preview";

interface WorkspaceClientProps {
  projectId: string;
  projectName: string;
  user: {
    id?: string;
    name?: string | null;
  };
}

export function WorkspaceClient({
  projectId,
  projectName,
  user,
}: WorkspaceClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/messages`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setMessages);

    fetch(`/api/projects/${projectId}/tasks`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setTasks);

    fetch(`/api/projects/${projectId}/files`)
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data) => setFiles(data.map?.((f: { path: string }) => f.path) ?? [])
      );
  }, [projectId]);

  const handleSendMessage = useCallback(
    async (content: string) => {
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
      setAgentStatus("Connecting...");

      try {
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              projectId,
              role: "system",
              content: `Agent error: ${err.error || res.statusText || "Request failed"}. Try again.`,
              metadata: {},
              toolCalls: null,
              tokenCount: null,
              createdAt: new Date(),
            },
          ]);
          setIsAgentWorking(false);
          setAgentStatus("");
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setIsAgentWorking(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = "";

          let currentEvent = "";
          let currentData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              currentData = line.slice(6).trim();
            } else if (line === "" && currentEvent && currentData) {
              handleSSEEvent(currentEvent, currentData);
              currentEvent = "";
              currentData = "";
            } else if (line !== "") {
              buffer += line + "\n";
            }
          }

          if (currentEvent || currentData) {
            if (currentEvent) buffer += `event: ${currentEvent}\n`;
            if (currentData) buffer += `data: ${currentData}\n`;
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            projectId,
            role: "system",
            content:
              "Request timed out or failed. The agent may still be processing. Try again in a moment.",
            metadata: {},
            toolCalls: null,
            tokenCount: null,
            createdAt: new Date(),
          },
        ]);
      } finally {
        setIsAgentWorking(false);
        setAgentStatus("");
        setActiveAgent(null);
      }
    },
    [projectId]
  );

  function handleSSEEvent(event: string, rawData: string) {
    try {
      const data = JSON.parse(rawData);

      switch (event) {
        case "status":
          setAgentStatus(data.message || "");
          if (data.agent) setActiveAgent(data.agent);
          break;

        case "message":
          if (data.message) {
            setMessages((prev) => [...prev, data.message]);
          }
          break;

        case "tasks":
          if (data.tasks) {
            setTasks(data.tasks);
          }
          break;

        case "task_status":
          setTasks((prev) =>
            prev.map((t) =>
              t.id === data.taskId ? { ...t, status: data.status } : t
            )
          );
          break;

        case "files":
          if (data.files) {
            setFiles(data.files);
          }
          break;

        case "tool_exec":
          setAgentStatus(
            data.tool === "write_file"
              ? `Writing ${data.input?.path || "file"}...`
              : data.tool === "read_file"
                ? `Reading ${data.input?.path || "file"}...`
                : data.tool === "delete_file"
                  ? `Deleting ${data.input?.path || "file"}...`
                  : data.tool === "install_package"
                    ? `Installing ${data.input?.package_name || "package"}...`
                    : `Running ${data.tool}...`
          );
          break;

        case "tool_error":
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              projectId,
              role: "system",
              content: `Agent error: ${data.error || "Something went wrong"}`,
              metadata: {},
              toolCalls: null,
              tokenCount: null,
              createdAt: new Date(),
            },
          ]);
          break;

        case "done":
          break;
      }
    } catch {
      // Ignore malformed events
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

  const MOBILE_TABS: {
    key: MobileTab;
    label: string;
    icon: typeof MessageSquare;
    badge?: number;
  }[] = [
    { key: "chat", label: "Chat", icon: MessageSquare },
    {
      key: "files",
      label: "Files",
      icon: FolderOpen,
      badge: files.length || undefined,
    },
    { key: "preview", label: "Preview", icon: Eye },
  ];

  return (
    <div className="workspace-root bg-bg-primary">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="text-border">/</span>
          <span className="truncate text-sm font-medium">{projectName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href={`/project/${projectId}/settings`}>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          <Button size="sm" onClick={handleDeploy} disabled={isAgentWorking}>
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Deploy</span>
          </Button>
        </div>
      </header>

      {/* Desktop layout */}
      <div className="hidden flex-1 overflow-hidden md:flex">
        <div className="flex w-[400px] shrink-0 flex-col border-r border-border">
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              isAgentWorking={isAgentWorking}
              agentStatus={agentStatus}
              activeAgent={activeAgent}
            />
          </div>
          <TasksPanel tasks={tasks} />
        </div>

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

      {/* Mobile layout */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {/* Tab content */}
        <div className="min-h-0 flex-1">
          {mobileTab === "chat" && (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <ChatPanel
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isAgentWorking={isAgentWorking}
                  agentStatus={agentStatus}
                  activeAgent={activeAgent}
                />
              </div>
              <TasksPanel tasks={tasks} />
            </div>
          )}
          {mobileTab === "files" && (
            <FilesPanel
              files={files}
              activeFile={activeFile}
              onSelectFile={setActiveFile}
              projectId={projectId}
            />
          )}
          {mobileTab === "preview" && (
            <PreviewPanel projectId={projectId} />
          )}
        </div>

        {/* Bottom tab bar */}
        <nav className="flex shrink-0 border-t border-border bg-bg-secondary pb-[env(safe-area-inset-bottom)]">
          {MOBILE_TABS.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-xs transition-colors ${
                mobileTab === key
                  ? "text-accent"
                  : "text-text-secondary active:text-text-primary"
              }`}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {badge ? (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </div>
              {label}
              {mobileTab === key && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
