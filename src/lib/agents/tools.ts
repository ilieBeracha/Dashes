import type { AgentTool } from "./types";

// --- Shared tools ---

export const readFile: AgentTool = {
  name: "read_file",
  description: "Read the contents of a file in the project.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to project root",
      },
    },
    required: ["path"],
  },
};

export const listFiles: AgentTool = {
  name: "list_files",
  description: "List all files in the project. Returns an array of file paths.",
  input_schema: { type: "object", properties: {} },
};

// --- Planner tools ---

export const createTaskList: AgentTool = {
  name: "create_task_list",
  description:
    "Create or replace the entire task list for this project. Each task should be a small, concrete unit of work.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short task title" },
            description: {
              type: "string",
              description:
                "Detailed description including file paths, component names, props, and behavior",
            },
            files: {
              type: "array",
              items: { type: "string" },
              description: "File paths this task will create or modify",
            },
            depends_on: {
              type: "array",
              items: { type: "number" },
              description: "Indices of tasks this depends on",
            },
          },
          required: ["title", "description", "files"],
        },
      },
    },
    required: ["tasks"],
  },
};

export const askUser: AgentTool = {
  name: "ask_user",
  description:
    "Ask the user a clarifying question. Use sparingly — only when the request is genuinely ambiguous.",
  input_schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask the user",
      },
    },
    required: ["question"],
  },
};

// --- Builder tools ---

export const writeFile: AgentTool = {
  name: "write_file",
  description:
    "Create or overwrite a file in the project. Provide the full file content.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to project root",
      },
      content: { type: "string", description: "Full file content" },
    },
    required: ["path", "content"],
  },
};

export const deleteFileTool: AgentTool = {
  name: "delete_file",
  description: "Delete a file from the project.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to project root",
      },
    },
    required: ["path"],
  },
};

export const installPackage: AgentTool = {
  name: "install_package",
  description: "Install an npm package. Runs npm install in the project.",
  input_schema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name with optional version, e.g. 'zod@3.22'",
      },
      dev: {
        type: "boolean",
        description: "Install as devDependency",
        default: false,
      },
    },
    required: ["package_name"],
  },
};

export const runTypecheck: AgentTool = {
  name: "run_typecheck",
  description:
    "Run the TypeScript type checker (tsc --noEmit). Returns errors if any, or a success message.",
  input_schema: { type: "object", properties: {} },
};

export const updateTaskStatus: AgentTool = {
  name: "update_task_status",
  description: "Mark the current task as done or failed.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["done", "failed"] },
      note: { type: "string", description: "Optional note about completion or failure" },
    },
    required: ["status"],
  },
};

export const handToPlanner: AgentTool = {
  name: "hand_to_planner",
  description:
    "Escalate to the Planner agent when the current task is ambiguous or needs re-planning.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why this task needs re-planning" },
    },
    required: ["reason"],
  },
};

// --- Deploy tools ---

export const triggerDeploy: AgentTool = {
  name: "trigger_deploy",
  description:
    "Deploy the project to Vercel. Uploads all project files and triggers a production build.",
  input_schema: { type: "object", properties: {} },
};

export const getDeployStatus: AgentTool = {
  name: "get_deploy_status",
  description: "Get the current deployment status.",
  input_schema: {
    type: "object",
    properties: {
      deploy_id: { type: "string", description: "Deployment ID. If omitted, returns latest." },
    },
  },
};

export const getDeployLogs: AgentTool = {
  name: "get_deploy_logs",
  description: "Fetch build logs for a deployment.",
  input_schema: {
    type: "object",
    properties: {
      deploy_id: { type: "string", description: "Deployment ID. If omitted, returns latest." },
    },
  },
};

export const rollbackDeploy: AgentTool = {
  name: "rollback_deploy",
  description: "Promote a previous deployment to be the active production deployment.",
  input_schema: {
    type: "object",
    properties: {
      deploy_id: { type: "string", description: "ID of the deployment to promote" },
    },
    required: ["deploy_id"],
  },
};

export const setEnvVar: AgentTool = {
  name: "set_env_var",
  description: "Set an environment variable for the Vercel project.",
  input_schema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Variable name" },
      value: { type: "string", description: "Variable value" },
      target: {
        type: "array",
        items: { type: "string", enum: ["production", "preview", "development"] },
        default: ["production", "preview"],
      },
    },
    required: ["key", "value"],
  },
};

export const handToBuilder: AgentTool = {
  name: "hand_to_builder",
  description: "Escalate to the Builder agent for code-level fixes.",
  input_schema: {
    type: "object",
    properties: {
      error_context: { type: "string", description: "Build error details for the Builder to fix" },
    },
    required: ["error_context"],
  },
};

// --- Tool sets per agent ---

export const PLANNER_TOOLS = [readFile, listFiles, createTaskList, askUser];
export const BUILDER_TOOLS = [
  readFile,
  listFiles,
  writeFile,
  deleteFileTool,
  installPackage,
  runTypecheck,
  updateTaskStatus,
  handToPlanner,
];
export const DEPLOY_TOOLS = [
  readFile,
  listFiles,
  triggerDeploy,
  getDeployStatus,
  getDeployLogs,
  rollbackDeploy,
  setEnvVar,
  handToBuilder,
];
