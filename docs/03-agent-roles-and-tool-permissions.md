# Dashes — Agent Roles and Tool Permissions

> Version: 0.1
> Date: 2026-03-31
> Status: Draft
> Depends on: [01 — MVP Scope](./01-mvp-scope.md), [02 — System Architecture](./02-system-architecture.md)

---

## 1. Agent Model

Dashes uses a **multi-agent orchestration** pattern. Each agent is a stateless Claude API call with:

- A **system prompt** defining its role, personality, and constraints
- A **tool set** (whitelisted per agent)
- **Context** injected by the orchestrator (conversation history, task list, file manifest, etc.)

Agents do not talk to each other directly. The **Orchestrator** manages all routing, handoffs, and shared state.

```
                    ┌──────────────┐
                    │ Orchestrator │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Planner  │ │ Builder  │ │  Deploy  │
        │  Agent   │ │  Agent   │ │  Agent   │
        └──────────┘ └──────────┘ └──────────┘
```

---

## 2. The Orchestrator

The Orchestrator is **not** an LLM agent. It is deterministic server-side logic that:

### 2.1 Responsibilities

| Responsibility | Details |
|---|---|
| **Routing** | Decides which agent handles each incoming message |
| **Context assembly** | Builds the prompt for each agent call (system prompt + relevant history + current state) |
| **Handoff management** | Transitions between agents (Planner → Builder → Deploy) |
| **Tool execution** | Receives tool calls from agents, executes them, returns results |
| **Permission enforcement** | Blocks tool calls that an agent is not allowed to make |
| **State management** | Maintains project state: current phase, active agent, task list, file manifest |
| **Error recovery** | Retries failed agent calls, escalates to user after max attempts |
| **Streaming** | Pipes agent response tokens to the client via WebSocket |

### 2.2 Routing Logic

```typescript
function routeMessage(project: Project, message: Message): AgentType {
  // Toolbar events with a quick change request → Builder directly
  if (message.toolbarContext && isSimpleChange(message)) {
    return 'builder';
  }

  // Explicit deploy request
  if (isDeployIntent(message)) {
    return 'deploy';
  }

  // No plan exists, or user is describing something new
  if (!project.hasActivePlan || isNewFeatureRequest(message)) {
    return 'planner';
  }

  // Plan exists with pending tasks
  if (project.hasActivePlan && project.hasPendingTasks) {
    return 'builder';
  }

  // All tasks done, user is giving feedback
  if (project.allTasksDone) {
    // Small tweak → Builder, big change → Planner
    return isSimpleChange(message) ? 'builder' : 'planner';
  }

  // Default: Planner figures it out
  return 'planner';
}
```

`isSimpleChange` and `isNewFeatureRequest` are lightweight classifiers — can start as keyword heuristics, upgrade to a small LLM call later if needed.

### 2.3 Handoff Rules

| From | To | Trigger |
|---|---|---|
| Planner | Builder | Planner outputs a finalized task list |
| Builder | Builder | Current task done, next task pending |
| Builder | Deploy | All tasks done + auto-deploy enabled, or user says "deploy" |
| Builder | Planner | Builder encounters ambiguity that needs re-planning |
| Deploy | Builder | Deploy fails due to build error → Builder attempts fix |
| Deploy | Chat (user) | Deploy succeeds → show URL; or deploy fails after Builder retry → escalate |
| Any | Planner | User sends a new feature request mid-build |

### 2.4 Context Window Management

Each agent call receives a trimmed context to stay within token limits:

| Context piece | Max size | Notes |
|---|---|---|
| System prompt | ~1,500 tokens | Static per agent |
| Task list | ~500 tokens | Current tasks with statuses |
| File manifest | ~500 tokens | List of file paths (not contents) |
| Relevant files | ~8,000 tokens | Only files the agent likely needs (based on task) |
| Recent messages | ~4,000 tokens | Last 10-20 messages in the project chat |
| Toolbar context | ~500 tokens | Only if the message originated from toolbar |
| **Total budget** | ~15,000 tokens | Leaves room for agent output (~4,000 tokens) |

The Orchestrator selects "relevant files" by:
1. Files mentioned in the current task description
2. Files the agent read/wrote in the last turn
3. Files referenced in the user's message
4. Import dependencies of the above (one level deep)

---

## 3. Planner Agent

### 3.1 Role

Translate user intent into a structured, ordered task list that the Builder can execute.

### 3.2 System Prompt (summary)

```
You are the Planner agent for Dashes. Your job is to take a user's description
of a web app (or a change to an existing app) and produce a clear, ordered task
list that a Builder agent can execute.

Rules:
- Each task must be concrete and actionable (e.g., "Create the PricingCard component
  at src/components/PricingCard.tsx with props: title, price, features, cta")
- Tasks are ordered by dependency — a task should only depend on tasks above it
- Keep tasks small: one component, one route, one data file per task
- If the user's request is ambiguous, ask ONE clarifying question before planning
- Do not write code. Only produce the plan.
- If a template is selected, reference its existing files in your plan
- When updating an existing plan, preserve completed tasks and only modify pending ones
```

### 3.3 Tools

| Tool | Description | Permission |
|---|---|---|
| `create_task_list` | Create or replace the task list for the project | ALLOWED |
| `update_task` | Modify a single task (title, description, order) | ALLOWED |
| `read_file` | Read a project file (to understand existing code before planning) | ALLOWED |
| `list_files` | List all files in the project | ALLOWED |
| `ask_user` | Send a clarifying question to the user (pauses execution) | ALLOWED |
| `write_file` | Write/create a file | BLOCKED |
| `delete_file` | Delete a file | BLOCKED |
| `install_package` | Install an npm package | BLOCKED |
| `run_typecheck` | Run TypeScript type checker | BLOCKED |
| `trigger_deploy` | Deploy the project | BLOCKED |

### 3.4 Output Format

The Planner must call `create_task_list` with a structured output:

```json
{
  "tasks": [
    {
      "title": "Create pricing data",
      "description": "Create src/lib/pricing.ts exporting an array of 3 plan objects: Starter ($9/mo, 3 features), Pro ($29/mo, 6 features), Enterprise ($99/mo, unlimited). Each object: { id, name, price, interval, features: string[], cta }.",
      "files": ["src/lib/pricing.ts"]
    },
    {
      "title": "Build PricingCard component",
      "description": "Create src/components/PricingCard.tsx. Props: plan object from pricing data. Render: card with plan name, price, feature list, CTA button. Style with Tailwind. Highlight the 'Pro' plan as recommended.",
      "files": ["src/components/PricingCard.tsx"],
      "depends_on": [0]
    },
    {
      "title": "Build pricing page",
      "description": "Create src/app/pricing/page.tsx. Import pricing data and PricingCard. Render a heading ('Simple, transparent pricing'), subheading, and a 3-column grid of PricingCards. Responsive: stack on mobile.",
      "files": ["src/app/pricing/page.tsx"],
      "depends_on": [0, 1]
    }
  ]
}
```

---

## 4. Builder Agent

### 4.1 Role

Execute tasks from the plan by writing code — creating files, editing files, installing packages, and verifying correctness.

### 4.2 System Prompt (summary)

```
You are the Builder agent for Dashes. You receive a specific task and execute it
by writing code.

Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS.

Rules:
- Write production-quality code. Use TypeScript strictly (no `any`).
- Use Tailwind for all styling. No CSS files unless absolutely necessary.
- Use Next.js App Router conventions: app/ directory, page.tsx, layout.tsx,
  loading.tsx, error.tsx, server components by default, "use client" only when needed.
- After writing files, always run type-check. If it fails, read the errors and fix them.
  You get 3 self-correction attempts before escalating.
- Show file diffs in your response so the user can follow along.
- Only modify files relevant to your current task. Do not refactor unrelated code.
- If a task is ambiguous or impossible given the current codebase, call hand_to_planner
  to request clarification.
- When installing packages, prefer well-maintained packages with minimal dependencies.
```

### 4.3 Tools

| Tool | Description | Permission |
|---|---|---|
| `write_file` | Create or overwrite a file | ALLOWED |
| `read_file` | Read a project file | ALLOWED |
| `list_files` | List all files in the project | ALLOWED |
| `delete_file` | Delete a file | ALLOWED |
| `install_package` | Add an npm package (runs `npm install <pkg>` in WebContainer) | ALLOWED |
| `run_typecheck` | Run `npx tsc --noEmit` and return errors | ALLOWED |
| `update_task_status` | Mark current task as done/failed | ALLOWED |
| `hand_to_planner` | Escalate to Planner when task is unclear | ALLOWED |
| `create_task_list` | Create/modify the task list | BLOCKED |
| `trigger_deploy` | Deploy the project | BLOCKED |
| `ask_user` | Ask user a question (Builder should code, not ask) | BLOCKED — escalate via `hand_to_planner` instead |

### 4.4 Execution Loop

```
For each pending task:
  1. Orchestrator injects: task description + relevant file contents
  2. Builder reads additional files if needed (via read_file)
  3. Builder writes files (via write_file)
  4. Builder runs type-check (via run_typecheck)
  5. If errors:
     a. Builder reads errors, attempts fix (up to 3 retries)
     b. If still failing → mark task as failed, escalate to user
  6. If clean: mark task as done (via update_task_status)
  7. Orchestrator moves to next task or triggers handoff
```

### 4.5 Self-Correction Protocol

```
attempt = 0
max_attempts = 3

while attempt < max_attempts:
  result = run_typecheck()
  if result.success:
    break

  attempt += 1
  // Feed errors back to Builder in the same conversation turn
  // Builder analyzes errors and writes corrected files

if attempt == max_attempts and not result.success:
  update_task_status("failed")
  // Orchestrator sends error summary to chat
  // User can intervene or ask Planner to re-plan
```

---

## 5. Deploy Agent

### 5.1 Role

Deploy the project to Vercel and manage the deployment lifecycle.

### 5.2 System Prompt (summary)

```
You are the Deploy agent for Dashes. You deploy Next.js projects to Vercel
and report results.

Rules:
- Before deploying, verify that the project has a valid package.json and
  next.config file.
- Set required environment variables before triggering the build.
- Stream build logs to the user.
- If the build fails, analyze the error log and either:
  a. Fix a simple config issue yourself (e.g., missing env var, wrong build command)
  b. Hand to Builder for code-level fixes
- On success, return the production URL prominently.
- On rollback request, promote the previous successful deployment.
```

### 5.3 Tools

| Tool | Description | Permission |
|---|---|---|
| `trigger_deploy` | Upload files to Vercel and start deployment | ALLOWED |
| `get_deploy_status` | Check current deployment status | ALLOWED |
| `get_deploy_logs` | Fetch build logs from Vercel | ALLOWED |
| `rollback_deploy` | Promote a previous deployment | ALLOWED |
| `set_env_var` | Set an environment variable for the Vercel project | ALLOWED |
| `list_deploys` | List deployment history | ALLOWED |
| `read_file` | Read a project file (to check config) | ALLOWED |
| `list_files` | List all files in the project | ALLOWED |
| `hand_to_builder` | Escalate to Builder for code fixes | ALLOWED |
| `write_file` | Write/edit files | BLOCKED — must hand to Builder |
| `delete_file` | Delete a file | BLOCKED |
| `install_package` | Install packages | BLOCKED |
| `create_task_list` | Modify task list | BLOCKED |

### 5.4 Deploy Decision Flow

```
Deploy requested
  │
  ├── Check: package.json exists?
  │     └── No → tell user, hand_to_builder to fix
  │
  ├── Check: env vars needed but not set?
  │     └── Yes → ask user for values via chat, then set_env_var
  │
  ├── trigger_deploy
  │
  ├── Stream build logs
  │
  ├── Build result?
  │     ├── Success → return URL, save deploy record
  │     └── Failure → analyze logs
  │           ├── Config issue (env var, build cmd) → fix and retry (1 attempt)
  │           └── Code issue → hand_to_builder with error context
  │
  └── Done
```

---

## 6. Tool Definitions

Full tool schemas used in Claude API calls:

### 6.1 Shared Tools

```typescript
const readFile = {
  name: "read_file",
  description: "Read the contents of a file in the project.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root. Example: src/app/page.tsx" }
    },
    required: ["path"]
  }
};

const listFiles = {
  name: "list_files",
  description: "List all files in the project. Returns an array of file paths.",
  input_schema: {
    type: "object",
    properties: {}
  }
};
```

### 6.2 Planner Tools

```typescript
const createTaskList = {
  name: "create_task_list",
  description: "Create or replace the entire task list for this project. Each task should be a small, concrete unit of work.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short task title" },
            description: { type: "string", description: "Detailed description of what to build, including file paths, component names, props, and behavior" },
            files: { type: "array", items: { type: "string" }, description: "File paths this task will create or modify" },
            depends_on: { type: "array", items: { type: "number" }, description: "Indices of tasks this depends on" }
          },
          required: ["title", "description", "files"]
        }
      }
    },
    required: ["tasks"]
  }
};

const updateTask = {
  name: "update_task",
  description: "Update a single task's title, description, or order.",
  input_schema: {
    type: "object",
    properties: {
      task_index: { type: "number", description: "Index of the task to update" },
      title: { type: "string" },
      description: { type: "string" }
    },
    required: ["task_index"]
  }
};

const askUser = {
  name: "ask_user",
  description: "Ask the user a clarifying question. Use sparingly — only when the request is genuinely ambiguous.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" }
    },
    required: ["question"]
  }
};
```

### 6.3 Builder Tools

```typescript
const writeFile = {
  name: "write_file",
  description: "Create or overwrite a file in the project. Provide the full file content.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root" },
      content: { type: "string", description: "Full file content" }
    },
    required: ["path", "content"]
  }
};

const deleteFile = {
  name: "delete_file",
  description: "Delete a file from the project.",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to project root" }
    },
    required: ["path"]
  }
};

const installPackage = {
  name: "install_package",
  description: "Install an npm package. Runs npm install in the project.",
  input_schema: {
    type: "object",
    properties: {
      package_name: { type: "string", description: "Package name with optional version. Example: 'lucide-react' or 'zod@3.22'" },
      dev: { type: "boolean", description: "Install as devDependency", default: false }
    },
    required: ["package_name"]
  }
};

const runTypecheck = {
  name: "run_typecheck",
  description: "Run the TypeScript type checker (tsc --noEmit). Returns errors if any, or a success message.",
  input_schema: {
    type: "object",
    properties: {}
  }
};

const updateTaskStatus = {
  name: "update_task_status",
  description: "Mark the current task as done or failed.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["done", "failed"] },
      note: { type: "string", description: "Optional note about completion or failure reason" }
    },
    required: ["status"]
  }
};

const handToPlanner = {
  name: "hand_to_planner",
  description: "Escalate to the Planner agent when the current task is ambiguous or needs re-planning.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why this task needs re-planning" }
    },
    required: ["reason"]
  }
};
```

### 6.4 Deploy Tools

```typescript
const triggerDeploy = {
  name: "trigger_deploy",
  description: "Deploy the project to Vercel. Uploads all project files and triggers a production build.",
  input_schema: {
    type: "object",
    properties: {}
  }
};

const getDeployStatus = {
  name: "get_deploy_status",
  description: "Get the current deployment status.",
  input_schema: {
    type: "object",
    properties: {
      deploy_id: { type: "string", description: "Deployment ID. If omitted, returns latest." }
    }
  }
};

const getDeployLogs = {
  name: "get_deploy_logs",
  description: "Fetch build logs for a deployment.",
  input_schema: {
    type: "object",
    properties: {
      deploy_id: { type: "string", description: "Deployment ID. If omitted, returns latest." }
    }
  }
};

const rollbackDeploy = {
  name: "rollback_deploy",
  description: "Promote a previous deployment to be the active production deployment.",
  input_schema: {
    type: "object",
    properties: {
      deploy_id: { type: "string", description: "ID of the deployment to promote" }
    },
    required: ["deploy_id"]
  }
};

const setEnvVar = {
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
        description: "Deployment targets",
        default: ["production", "preview"]
      }
    },
    required: ["key", "value"]
  }
};

const listDeploys = {
  name: "list_deploys",
  description: "List previous deployments with status and URLs.",
  input_schema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max number of deploys to return", default: 10 }
    }
  }
};

const handToBuilder = {
  name: "hand_to_builder",
  description: "Escalate to the Builder agent for code-level fixes.",
  input_schema: {
    type: "object",
    properties: {
      error_context: { type: "string", description: "Build error details for the Builder to fix" }
    },
    required: ["error_context"]
  }
};
```

---

## 7. Permission Matrix (summary)

| Tool | Planner | Builder | Deploy |
|---|---|---|---|
| `read_file` | yes | yes | yes |
| `list_files` | yes | yes | yes |
| `create_task_list` | yes | - | - |
| `update_task` | yes | - | - |
| `ask_user` | yes | - | - |
| `write_file` | - | yes | - |
| `delete_file` | - | yes | - |
| `install_package` | - | yes | - |
| `run_typecheck` | - | yes | - |
| `update_task_status` | - | yes | - |
| `hand_to_planner` | - | yes | - |
| `hand_to_builder` | - | - | yes |
| `trigger_deploy` | - | - | yes |
| `get_deploy_status` | - | - | yes |
| `get_deploy_logs` | - | - | yes |
| `rollback_deploy` | - | - | yes |
| `set_env_var` | - | - | yes |
| `list_deploys` | - | - | yes |

---

## 8. Error Handling & Recovery

### 8.1 Agent Call Failures

| Failure type | Recovery |
|---|---|
| Claude API timeout | Retry once with same context. If still fails, notify user. |
| Claude API rate limit | Queue and retry with exponential backoff. Show "Agent is busy" in chat. |
| Agent returns no tool calls and no useful text | Retry with a nudge: "Please use your tools to complete the task." Max 2 retries. |
| Agent calls a blocked tool | Orchestrator blocks execution, logs the attempt, retries with a reminder of allowed tools. |
| Agent produces malformed tool call | Orchestrator returns a tool error result, agent self-corrects on next turn. |

### 8.2 Build Failures (Builder self-correction)

```
Attempt 1: Builder writes code → typecheck fails
  → Feed errors back to Builder in same conversation
Attempt 2: Builder fixes based on errors → typecheck fails
  → Feed errors back again
Attempt 3: Builder tries final fix → typecheck fails
  → Task marked as failed
  → Orchestrator sends to chat: "I couldn't fix these type errors after 3 attempts.
     Here's what's failing: [errors]. Can you help me understand what you'd like?"
```

### 8.3 Deploy Failures

```
Build fails on Vercel
  → Deploy Agent reads logs
  → If config issue (missing env var, wrong Node version): fix and retry once
  → If code issue: hand_to_builder with error context
  → Builder fixes → Deploy Agent retries
  → If still fails: escalate to user with full error context
```

### 8.4 Catastrophic Recovery

If the project gets into a broken state that agents can't recover from:

1. User can manually edit files in the editor
2. User can say "start over from the template" (resets files, keeps chat history)
3. User can say "undo the last change" (Orchestrator restores previous file versions from S3 versioning)

---

## 9. Future Agents (post-MVP)

| Agent | Role | Why deferred |
|---|---|---|
| **Designer** | Generate/refine UI from mockups or Figma imports | Needs multimodal input, complex tooling |
| **QA** | Write and run tests, validate user flows | Valuable but not critical for MVP launch loop |
| **Database** | Design schema, generate migrations, seed data | Adds significant complexity; MVP apps can use simple data files or direct Supabase setup |
| **Reviewer** | Code review agent that checks Builder output before deploy | Nice-to-have; Builder's self-correction covers basic quality for now |

---

*Next document: [04 — Data Model and Schema](./04-data-model-and-schema.md)*
