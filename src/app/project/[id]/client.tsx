"use client";

import { useState, useEffect, useCallback } from "react";
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
  projectName: string;
  user: {
    id?: string;
    name?: string | null;
  };
}

export function WorkspaceClient({ projectId, projectName, user }: WorkspaceClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  // Load existing messages, tasks, and files on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/messages`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setMessages);

    fetch(`/api/projects/${projectId}/tasks`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setTasks);

    fetch(`/api/projects/${projectId}/files`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFiles(data.map?.((f: { path: string }) => f.path) ?? []));
  }, [projectId]);

  const handleSendMessage = useCallback(
    async (content: string) => {
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

        // Read SSE stream
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

          // Parse SSE events from buffer
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
              // End of event — process it
              handleSSEEvent(currentEvent, currentData);
              currentEvent = "";
              currentData = "";
            } else if (line !== "") {
              // Incomplete event, put back in buffer
              buffer += line + "\n";
            }
          }

          // If we have an incomplete event in progress, keep it in buffer
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
          // Tool errors are informational — builder continues
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
          // Stream complete
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
          <span className="text-sm font-medium">{projectName}</span>
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
              agentStatus={agentStatus}
              activeAgent={activeAgent}
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
