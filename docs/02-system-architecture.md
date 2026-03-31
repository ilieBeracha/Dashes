# Dashes — System Architecture

> Version: 0.1
> Date: 2026-03-31
> Status: Draft
> Depends on: [01 — MVP Scope](./01-mvp-scope.md)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │  Chat UI │ │ Task List│ │ Monaco Editor│ │ Preview Panel │  │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ └───────┬───────┘  │
│       │             │              │           ┌─────┴──────┐   │
│       │             │              │           │WebContainer│   │
│       │             │              │           │ (next dev) │   │
│       │             │              │           │ + Toolbar   │   │
│       │             │              │           └─────┬──────┘   │
│  ─────┴─────────────┴──────────────┴─────────────────┴───────   │
│                        WebSocket + REST                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js on Vercel)                 │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  Next.js API │  │ Agent Orchestrator│  │  Deploy Service  │  │
│  │  Routes      │  │                  │  │  (Vercel API)    │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬──────────┘  │
│         │                   │                      │             │
│  ───────┴───────────────────┴──────────────────────┴──────────   │
│                        Internal Services                         │
└────────┬──────────────────────┬──────────────────────┬──────────┘
         │                      │                      │
         ▼                      ▼                      ▼
   ┌──────────┐          ┌──────────┐           ┌──────────┐
   │ Postgres │          │    S3    │           │  Claude  │
   │ (Neon)   │          │  (R2)   │           │   API    │
   └──────────┘          └──────────┘           └──────────┘
```

---

## 2. Key Architecture Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| AD-1 | Runtime sandbox | WebContainers (StackBlitz SDK) | No server-side containers to manage. Node.js runs in the browser. Instant boot, zero infra cost per project. |
| AD-2 | Preview hosting | WebContainer in iframe | Comes free with AD-1. `next dev` runs client-side. No preview servers to scale. |
| AD-3 | File storage | S3-compatible (Cloudflare R2) | Files stored as blobs keyed by `project_id/path`. Synced to WebContainer on project open. Simple, cheap, no git complexity. |
| AD-4 | Agent execution | Server-side Node.js | Agents call Claude API from backend. Keeps API keys secure. Streams results to client via WebSocket. |
| AD-5 | Real-time transport | WebSocket (Socket.IO) | Chat streaming, file sync, task updates, preview toolbar events — all need bidirectional real-time. |
| AD-6 | Deployment | Vercel API | Programmatic deploy via Vercel REST API. Upload source files, trigger build, get URL. |
| AD-7 | Database | PostgreSQL (Neon) | Serverless Postgres. Handles platform data: users, projects, messages, tasks, deploys. |
| AD-8 | Monorepo | Single Next.js app | Platform frontend + API in one deployable. Simpler DX for MVP. Split later if needed. |

---

## 3. Component Breakdown

### 3.1 Client Layer

#### Chat Panel
- Renders message stream (user + agent messages)
- Sends user messages via WebSocket
- Displays agent "thinking" indicators, file diffs, task updates inline
- Supports rich blocks: code diffs, task lists, deploy status cards, toolbar context

#### Task Panel
- Reads task list from server state
- Shows status per task (pending, in-progress, done, failed)
- User can reorder or remove tasks (sends update to Planner Agent)

#### File Panel (Monaco Editor)
- File tree component reads project file manifest from server
- Opens files from S3 via API, caches in memory
- User edits save to server (debounced) → server writes to S3 → sync to WebContainer
- Agent edits arrive via WebSocket → update editor buffer + save to S3

#### Preview Panel
- Boots a WebContainer instance on project open
- Mounts project files into the WebContainer filesystem
- Runs `npm install` then `next dev` inside WebContainer
- Renders the dev server output in an iframe
- File changes (from editor or agent) are written to WebContainer FS → HMR picks them up

#### Preview Toolbar
- Injected into the preview iframe as a floating UI overlay
- Communicates with the parent window via `postMessage`
- Captures: runtime errors (window.onerror), element clicks (DOM path + bounding box), screenshots (html2canvas), console logs
- Sends structured events to parent → parent forwards to server via WebSocket → appears in chat

### 3.2 Backend Layer

#### API Routes (Next.js)

| Route group | Purpose |
|---|---|
| `/api/auth/*` | NextAuth.js — GitHub OAuth flow, session management |
| `/api/projects/*` | CRUD for projects, list/search/archive |
| `/api/projects/[id]/files/*` | Read/write/delete project files in S3 |
| `/api/projects/[id]/deploy` | Trigger deploy, get deploy status/history |
| `/api/projects/[id]/env` | Manage environment variables for deploys |
| `/api/templates/*` | List/read starter templates |

#### WebSocket Server

Runs alongside the Next.js app (via custom server or separate process on Vercel serverless via a persistent connection service like Ably/Pusher, or a small dedicated WS server on Railway/Fly).

Channels per project:

| Channel | Events |
|---|---|
| `chat:{projectId}` | `user_message`, `agent_message`, `agent_thinking`, `agent_done` |
| `files:{projectId}` | `file_created`, `file_updated`, `file_deleted` |
| `tasks:{projectId}` | `task_added`, `task_updated`, `task_status_changed` |
| `deploy:{projectId}` | `deploy_started`, `deploy_log`, `deploy_success`, `deploy_failed` |
| `toolbar:{projectId}` | `error_report`, `element_selected`, `screenshot`, `console_log` |

#### Agent Orchestrator

The core brain of the backend. Responsibilities:

```
User message arrives
       │
       ▼
┌──────────────┐
│  Orchestrator│
│              │─── Maintains conversation context per project
│              │─── Decides which agent handles the message
│              │─── Manages agent handoffs (Planner → Builder → Deploy)
│              │─── Enforces tool permissions per agent
│              │─── Handles error recovery and retries
└──────┬───────┘
       │
       ├──→ Planner Agent (Claude API call with planner system prompt + tools)
       ├──→ Builder Agent (Claude API call with builder system prompt + tools)
       └──→ Deploy Agent  (Claude API call with deploy system prompt + tools)
```

**Orchestrator flow:**

1. Receive message (user chat, toolbar event, or task trigger)
2. Load project context: recent messages, current task list, file manifest
3. Route to the appropriate agent based on:
   - If no plan exists or user is describing something new → **Planner**
   - If there are pending tasks to execute → **Builder**
   - If user says "deploy" or Builder completed all tasks → **Deploy**
   - If message is a small change (toolbar feedback, "make this blue") → **Builder** directly (skip Planner)
4. Call Claude API with agent-specific system prompt, tools, and context
5. Stream agent response tokens to client via WebSocket
6. Execute tool calls (file writes, package installs, deploy triggers)
7. After agent turn completes, check if handoff is needed (Planner done → Builder starts)

#### Deploy Service

Wraps the Vercel REST API:

1. **First deploy**: Create Vercel project via API, link to Dashes project
2. **Deploy**: Read all project files from S3, upload via Vercel Deployments API, trigger build
3. **Status**: Poll Vercel for build status, stream logs to client
4. **Rollback**: Promote a previous deployment to current
5. **Env vars**: Set/update environment variables via Vercel API

### 3.3 Data Layer

#### PostgreSQL (Neon) — Platform Data

```
users
  id              UUID PK
  github_id       TEXT UNIQUE
  email           TEXT
  name            TEXT
  avatar_url      TEXT
  created_at      TIMESTAMPTZ

projects
  id              UUID PK
  user_id         UUID FK → users
  name            TEXT
  description     TEXT
  template_id     TEXT NULLABLE
  vercel_project_id TEXT NULLABLE
  status          ENUM (active, archived)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

messages
  id              UUID PK
  project_id      UUID FK → projects
  role            ENUM (user, planner, builder, deploy, system)
  content         JSONB          -- text + optional rich blocks (diffs, cards)
  tool_calls      JSONB NULLABLE -- tool invocations and results
  created_at      TIMESTAMPTZ

tasks
  id              UUID PK
  project_id      UUID FK → projects
  title           TEXT
  description     TEXT
  status          ENUM (pending, in_progress, done, failed)
  order_index     INT
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

deploys
  id              UUID PK
  project_id      UUID FK → projects
  vercel_deploy_id TEXT
  url             TEXT
  status          ENUM (building, ready, error)
  build_log       TEXT
  created_at      TIMESTAMPTZ
```

#### S3 (Cloudflare R2) — Project Files

```
Bucket: dashes-project-files

Key structure:
  {project_id}/{file_path}

Examples:
  abc123/package.json
  abc123/src/app/page.tsx
  abc123/src/app/layout.tsx
  abc123/tailwind.config.ts
```

- Files are read/written individually via the S3 API
- On project open, the client fetches the file manifest (list of keys) and bootstraps the WebContainer
- File metadata (size, last modified) cached in Postgres for fast file tree rendering

---

## 4. Data Flow Diagrams

### 4.1 Agent Build Flow

```
User types: "Add a pricing page with 3 tiers"
  │
  ▼
WebSocket → Backend Orchestrator
  │
  ▼
Orchestrator loads context, routes to Planner Agent
  │
  ▼
Planner Agent (Claude API)
  ├── Returns: task list [1. Create pricing data, 2. Build PricingCard, 3. Build /pricing page]
  ├── Tasks saved to DB
  └── Task list streamed to client → Tasks panel updates
  │
  ▼
Orchestrator hands off to Builder Agent (task 1)
  │
  ▼
Builder Agent (Claude API with file tools)
  ├── Tool call: write_file("src/lib/pricing.ts", "...")
  │     ├── File saved to S3
  │     ├── file_updated event → client
  │     ├── Client writes to WebContainer FS → HMR
  │     └── Editor updates if file is open
  ├── Tool call: write_file("src/components/PricingCard.tsx", "...")
  │     └── (same flow)
  ├── Tool call: write_file("src/app/pricing/page.tsx", "...")
  │     └── (same flow)
  ├── Tool call: run_typecheck()
  │     ├── Executed in WebContainer (or server-side)
  │     ├── If errors → Builder self-corrects
  │     └── If clean → task marked done
  └── Agent response streamed to chat
  │
  ▼
All tasks done → Orchestrator sends "Ready to deploy?" to chat
```

### 4.2 Toolbar Feedback Flow

```
User clicks element in preview iframe
  │
  ▼
Toolbar captures: { component: "src/components/Header.tsx", selector: "button.cta", screenshot: "base64..." }
  │
  ▼
postMessage → Parent window
  │
  ▼
Parent sends via WebSocket → Backend
  │
  ▼
User types: "Make this button larger and green"
  │
  ▼
Orchestrator bundles: user message + toolbar context
  │
  ▼
Routes directly to Builder Agent (trivial change, skip Planner)
  │
  ▼
Builder reads Header.tsx from S3, edits the button styles
  │
  ▼
File saved → S3 + WebContainer → HMR → preview updates in ~1s
```

### 4.3 Deploy Flow

```
User says "Deploy" (or agent triggers after build complete)
  │
  ▼
Orchestrator routes to Deploy Agent
  │
  ▼
Deploy Agent calls deploy tool
  │
  ▼
Deploy Service:
  ├── If first deploy: create Vercel project via API
  ├── Read all files from S3 for this project
  ├── Upload files to Vercel via Deployments API
  ├── Set env vars if needed
  └── Trigger build
  │
  ▼
Poll Vercel for build status
  ├── Stream build logs to client via deploy:{projectId} channel
  ├── On success: save deploy record, return production URL
  └── On failure: send error to chat, Builder Agent can attempt fix
```

---

## 5. WebContainer Integration Details

### Boot Sequence (on project open)

```
1. Client fetches file manifest from API: GET /api/projects/{id}/files
2. Client boots WebContainer instance: WebContainer.boot()
3. Client fetches file contents in parallel (batched)
4. Mount files into WebContainer FS
5. Run: npm install (WebContainer has built-in npm)
6. Run: npx next dev --port 3000
7. WebContainer exposes local URL → load in preview iframe
8. Ready state: ~5-10 seconds for a typical Next.js project
```

### File Sync Strategy

```
Agent writes file → S3
                  → WebSocket event to client
                  → Client writes to WebContainer FS
                  → Next.js HMR detects change → preview updates

User edits file  → Debounced save to API → S3
                 → Client writes to WebContainer FS
                 → Next.js HMR detects change → preview updates
```

### Limitations (MVP)

- WebContainers run in-browser: limited to ~512MB memory per session
- No native binary dependencies (pure JS/WASM only — fine for Next.js + Tailwind)
- One project per tab (WebContainer is a singleton per page)
- Cold boot is ~5-10s; subsequent file changes are instant via HMR

---

## 6. Security Considerations (MVP)

| Area | Approach |
|---|---|
| API keys | Claude API key and Vercel token stored server-side only. Never sent to client. |
| Auth | NextAuth.js with GitHub OAuth. Session tokens in httpOnly cookies. |
| Agent sandboxing | Agents can only call whitelisted tools. No shell access. File writes scoped to project. |
| WebContainer isolation | Runs in browser sandbox. Cannot access host filesystem or network (except via service worker proxy). |
| Preview iframe | Sandboxed iframe with `allow-scripts allow-same-origin`. Toolbar uses `postMessage` with origin checks. |
| User file access | API enforces `project.user_id === session.user.id` on every file/project operation. |
| Env vars | Encrypted at rest in Postgres. Only sent to Vercel API during deploy, never to client. |

---

## 7. Infrastructure & Hosting

| Component | Host | Why |
|---|---|---|
| Next.js app (frontend + API) | Vercel | Dogfooding. Serverless functions for API routes. Edge for static. |
| WebSocket server | Railway or Fly.io | Needs persistent connections. Vercel serverless can't hold WS. Small single-process Node.js server. |
| PostgreSQL | Neon | Serverless Postgres. Auto-scales. Branching for dev/staging. |
| File storage | Cloudflare R2 | S3-compatible, no egress fees. |
| Claude API | Anthropic | Direct API calls from backend. |
| Vercel API | Vercel | Deploy generated apps programmatically. |

### Cost Profile (MVP, low usage)

| Component | Estimated monthly cost |
|---|---|
| Vercel (platform hosting) | Free tier / $20 Pro |
| Railway (WS server) | ~$5 (low traffic) |
| Neon (Postgres) | Free tier |
| Cloudflare R2 | Free tier (10GB storage, 10M reads) |
| Claude API | Variable — ~$0.05–0.20 per project generation |
| Vercel (generated app deploys) | User's own Vercel account, or Dashes team account with limits |

---

## 8. Scaling Notes (post-MVP)

These are not built in v1, but the architecture should not block them:

- **WebSocket server** → horizontal scale behind a load balancer with sticky sessions (or switch to Redis pub/sub for multi-instance)
- **File storage** → migrate to git-backed storage if version history becomes critical
- **Agent execution** → queue-based (BullMQ/Redis) if agent tasks need to be rate-limited or prioritized
- **Multi-framework** → WebContainer supports any Node.js framework; agent prompts and templates change, architecture doesn't
- **Collaboration** → CRDT layer (Yjs) on top of the file sync model; WebSocket channels already exist per project

---

*Next document: [03 — Agent Roles and Tool Permissions](./03-agent-roles-and-tool-permissions.md)*
