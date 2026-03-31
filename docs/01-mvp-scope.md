# Dashes — MVP Scope Document

> Version: 0.1
> Date: 2026-03-31
> Status: Draft

---

## 1. Product Vision (one sentence)

Dashes is a single control plane where you describe a web app in chat, and agents plan it, build it, preview it, deploy it, and keep iterating on it — all without leaving the platform.

---

## 2. Core Value Proposition

| Layer | What it means |
|---|---|
| One control plane | Global dashboard across all your generated projects |
| Many managed projects | Each project is an isolated workspace with its own chat, files, tasks, preview, and deploy |
| Agent chat as main interface | You talk; agents plan, code, fix, deploy |
| Online editor + preview | See and edit code in-browser, live preview beside it |
| Deployment built in | One-click (or zero-click) deploy to production |
| Runtime toolbar | Embedded toolbar in the preview/dev app that sends context (errors, screenshots, selections) back to the project chat |
| Continuous iteration | Post-launch feedback loop — toolbar → chat → agents → redeploy |

---

## 3. MVP Constraints (what keeps scope tight)

| Constraint | MVP choice |
|---|---|
| App type | Web apps only (no mobile, no CLI, no library) |
| Framework | Next.js (App Router) — single framework |
| Language | TypeScript only |
| Styling | Tailwind CSS |
| Deployment provider | Vercel (single provider) |
| Dashboard | One global dashboard |
| Project workspace | One workspace layout per project |
| Agents | 3 core agents (Planner, Builder, Deploy) |
| Toolbar | Preview/dev mode only — not injected in production builds |
| Auth | GitHub OAuth (single provider for MVP) |
| Database | PostgreSQL via a managed provider (e.g. Supabase or Neon) for generated apps that need persistence |
| Payments / billing | Out of scope for v1 |

---

## 4. In v1

### 4.1 Global Dashboard

- List of all projects (name, status, last activity, deploy URL)
- Create new project (from blank or template)
- Delete / archive project
- Search and filter projects

### 4.2 Project Workspace

Each project opens into a unified workspace with these panels:

| Panel | Purpose |
|---|---|
| **Chat** | Primary interface — talk to agents, see their progress, approve actions |
| **Tasks** | Agent-generated task list (plan breakdown), status per task |
| **Files** | In-browser file tree + code editor (Monaco-based) |
| **Preview** | Live iframe preview of the running app with embedded toolbar |
| **Deploy** | Deploy status, deploy history, production URL, environment variables |

### 4.3 Agents

#### Planner Agent
- Receives the user's project description or change request
- Produces a structured task list (ordered, with dependencies)
- Asks clarifying questions when the request is ambiguous
- Updates the task list when scope changes mid-conversation

#### Builder Agent
- Executes tasks from the plan: creates/edits files, installs packages
- Writes Next.js App Router pages, components, API routes, server actions
- Generates Tailwind-styled UI
- Runs lint and type-check after each change; self-corrects on failure
- Streams file diffs into the chat so the user can follow along

#### Deploy Agent
- Configures the Vercel project (env vars, build settings) on first deploy
- Triggers deployment on user request or after Builder completes a task set
- Reports build logs, deploy status, and production URL back to chat
- Rolls back to previous deployment on user request

### 4.4 Template / Boilerplate System

- Curated starter templates: blank Next.js, SaaS dashboard, landing page, blog, e-commerce storefront
- Templates define: file structure, pre-installed packages, seed data, placeholder content
- Planner uses the selected template as the starting scaffold

### 4.5 Preview Toolbar (dev mode)

Embedded in the preview iframe. Capabilities:

- **Error reporter** — captures runtime errors and sends stack trace + context to chat
- **Element selector** — user clicks an element, toolbar sends component path + screenshot to chat ("change this button to blue")
- **Screenshot** — captures current viewport and attaches to chat message
- **Quick prompt** — inline text input that sends a message to the project chat with current page context
- **Console log viewer** — shows recent console output, user can forward entries to chat

### 4.6 Online Code Editor

- Monaco-based editor in the Files panel
- Syntax highlighting, IntelliSense for TypeScript / Next.js
- User can manually edit any file; changes are saved and reflected in preview
- Agent edits and user edits coexist (agent warns if it will overwrite a user change)

### 4.7 Auth & Project Ownership

- GitHub OAuth sign-in
- Each project belongs to one user (no collaboration in v1)
- Projects are private by default

---

## 5. Out of v1

| Feature | Why deferred |
|---|---|
| Multiple frameworks (Remix, Nuxt, SvelteKit, etc.) | Adds agent complexity; ship one well first |
| Mobile app generation (React Native, Flutter) | Different build/deploy pipeline |
| Multi-user collaboration / real-time co-editing | Significant infrastructure (CRDT, presence, permissions) |
| Custom domains | Nice-to-have; Vercel provides `.vercel.app` subdomains |
| Production toolbar injection | Security, performance, and consent concerns — need careful design |
| Self-hosted / on-prem deployment targets | AWS, GCP, Docker — each needs its own Deploy Agent logic |
| Git integration (push to user's repo) | Useful but not required for the core loop |
| Plugin / extension system | Premature abstraction |
| Billing / usage metering | No monetization in v1 |
| Multiple AI model providers | Start with one (Claude); abstract later |
| CI/CD pipelines | Vercel handles build; no need for custom CI in v1 |
| Database admin UI | Users can use Supabase/Neon dashboards directly |
| Designer agent / Figma import | High effort, uncertain value at this stage |
| QA / testing agent | Builder agent runs lint + type-check; full test gen is v2 |

---

## 6. First Stack Choice

### Platform (Dashes itself)

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Code editor | Monaco Editor (`@monaco-editor/react`) |
| Real-time | WebSockets (Socket.IO or native WS) for chat streaming + live preview updates |
| Backend API | Next.js API routes + server actions (monorepo, same app) |
| Agent orchestration | Custom orchestrator service (Node.js) — routes messages between user ↔ agents, manages task state |
| LLM provider | Anthropic Claude API (tool use for agents) |
| Database | PostgreSQL (platform data: users, projects, tasks, chat history, deploy records) |
| File storage | S3-compatible object store for project source files (or git-backed file system) |
| Auth | NextAuth.js with GitHub OAuth provider |
| Hosting | Vercel (for the Dashes platform itself) |

### Generated Apps (what agents build)

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Deployment | Vercel (via Vercel API) |
| Database (optional) | PostgreSQL via Supabase or Neon, provisioned on demand |

---

## 7. MVP User Flow (happy path)

```
1. User signs in via GitHub OAuth
2. Lands on global dashboard (empty state → "Create your first project")
3. Clicks "New Project" → picks template (or blank) → names it
4. Project workspace opens with Chat panel focused
5. User types: "Build me a SaaS dashboard with auth, a billing page, and a settings page"
6. Planner Agent responds with a task list (5–10 tasks), asks one clarifying question
7. User answers → Planner finalizes plan → tasks appear in Tasks panel
8. Builder Agent starts executing tasks sequentially
   - Files appear in Files panel as they are created
   - Preview panel shows the app taking shape in real time
9. Builder completes → chat says "Build complete. Ready to deploy?"
10. User says "Deploy" → Deploy Agent provisions Vercel project → deploys → returns URL
11. User opens preview, uses toolbar to click a button → "Make this button green and bigger"
12. Planner skips (trivial change) → Builder edits the component → preview updates
13. User says "Deploy again" → Deploy Agent redeploys → new production build live
```

---

## 8. Success Criteria for MVP

- [ ] User can go from zero to deployed Next.js app in under 10 minutes via chat
- [ ] Planner produces a coherent task list for common app types (landing page, dashboard, CRUD app)
- [ ] Builder generates working, type-safe, styled code that passes `next build`
- [ ] Preview reflects changes within seconds of Builder completing a task
- [ ] Toolbar captures errors and element context and delivers them to chat accurately
- [ ] Deploy Agent deploys to Vercel and returns a working URL
- [ ] Full iteration loop works: describe → build → preview → feedback via toolbar → rebuild → redeploy

---

## 9. Open Questions

1. **File system model** — Should generated project files live in S3 as flat blobs, or in a lightweight git repo per project? Git gives version history but adds complexity.
2. **Agent sandboxing** — How do we run `next build` and `next dev` for preview? Options: containerized builds (e.g. Firecracker microVMs, Docker), Vercel's build pipeline only, or a managed sandbox service (e.g. CodeSandbox API, StackBlitz WebContainers).
3. **Preview hosting** — Is the preview iframe hitting a dev server we run, or a WebContainer in the browser? Latency and cost implications differ significantly.
4. **Rate limiting / abuse** — Even without billing, we need guardrails on how many builds/deploys a free user can trigger.
5. **Agent error recovery** — When Builder produces code that fails `next build`, how many self-correction attempts before escalating to the user?

---

*Next document: [02 — System Architecture](./02-system-architecture.md)*
