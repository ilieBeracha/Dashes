import type { AgentType, ToolCall } from "@/types";

export interface AgentContext {
  projectId: string;
  recentMessages: { role: string; content: string }[];
  taskList: { title: string; description: string; status: string }[];
  fileManifest: string[];
  relevantFiles: { path: string; content: string }[];
  toolbarContext?: Record<string, unknown>;
}

export interface AgentResponse {
  content: string;
  toolCalls: ToolCall[];
  handoff?: AgentType;
  tasks?: {
    title: string;
    description: string;
    files: string[];
    dependsOn?: number[];
  }[];
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
