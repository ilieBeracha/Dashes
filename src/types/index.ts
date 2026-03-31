// Re-export DB types for convenience
export type {
  User,
  Project,
  Message,
  Task,
  Deploy,
  ProjectEnvVar,
  ProjectFile,
} from "@/db/schema";

// --- Agent types ---

export type AgentType = "planner" | "builder" | "deploy";

export type AgentPhase = "idle" | "planning" | "building" | "deploying";

// --- WebSocket event types ---

export interface ChatMessageEvent {
  type: "user_message" | "agent_message" | "agent_thinking" | "agent_done";
  projectId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface FileEvent {
  type: "file_created" | "file_updated" | "file_deleted";
  projectId: string;
  path: string;
  content?: string;
}

export interface TaskEvent {
  type: "task_added" | "task_updated" | "task_status_changed";
  projectId: string;
  taskId: string;
  status?: string;
}

export interface DeployEvent {
  type: "deploy_started" | "deploy_log" | "deploy_success" | "deploy_failed";
  projectId: string;
  deployId?: string;
  url?: string;
  log?: string;
}

export interface ToolbarEvent {
  type: "error_report" | "element_selected" | "screenshot" | "console_log";
  projectId: string;
  data: {
    component?: string;
    selector?: string;
    screenshot?: string;
    error?: string;
    stackTrace?: string;
    message?: string;
  };
}

// --- Tool call types ---

export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

// --- Message metadata blocks ---

export type RichBlockType =
  | "file_diff"
  | "task_list_card"
  | "deploy_card"
  | "toolbar_context"
  | "error_block";

export interface RichBlock {
  type: RichBlockType;
  [key: string]: unknown;
}

// --- Template types ---

export interface Template {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  files: TemplateFile[];
  packages: string[];
}

export interface TemplateFile {
  path: string;
  content: string;
}
