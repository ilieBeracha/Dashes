# Dashes — UX Flows and Dashboard Structure

> Version: 0.1
> Date: 2026-03-31
> Status: Draft
> Depends on: [01 — MVP Scope](./01-mvp-scope.md), [02 — System Architecture](./02-system-architecture.md)

---

## 1. Page Map

```
/                         → Landing page (marketing, not in MVP — redirect to /dashboard)
/login                    → GitHub OAuth sign-in
/dashboard                → Global project dashboard
/project/:id              → Project workspace (chat + tasks + files + preview + deploy)
/project/:id/settings     → Project settings (name, env vars, danger zone)
```

Four pages total for MVP. No nested routing complexity.

---

## 2. Screen Layouts

### 2.1 Login

```
┌─────────────────────────────────────────────┐
│                                             │
│                  Dashes logo                │
│                                             │
│            "Build and ship web apps         │
│             with AI agents"                 │
│                                             │
│         ┌──────────────────────┐            │
│         │ Sign in with GitHub  │            │
│         └──────────────────────┘            │
│                                             │
└─────────────────────────────────────────────┘
```

- Single OAuth button
- Redirects to `/dashboard` on success

### 2.2 Global Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  Dashes    [Search projects...]                [avatar ▼]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  My Projects                          [+ New Project]        │
│                                                              │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐   │
│  │ SaaS Dashboard │ │ Portfolio Site │ │ E-commerce MVP │   │
│  │                │ │                │ │                │   │
│  │ ● Active       │ │ ● Active       │ │ ○ Archived     │   │
│  │ vercel.app/... │ │ vercel.app/... │ │                │   │
│  │ Updated 2h ago │ │ Updated 1d ago │ │ Updated 5d ago │   │
│  └────────────────┘ └────────────────┘ └────────────────┘   │
│                                                              │
│  ┌────────────────┐                                          │
│  │       +        │                                          │
│  │  New Project   │                                          │
│  └────────────────┘                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Components:**
- **Top bar** — logo, search input (filters project cards client-side), user avatar dropdown (settings, sign out)
- **Project cards** — grid layout, responsive (3 cols → 2 → 1). Each card shows: name, status badge, production URL (if deployed), last updated timestamp
- **New Project button** — opens the new project modal
- **Empty state** — illustration + "Create your first project" CTA

### 2.3 New Project Modal

```
┌──────────────────────────────────────────┐
│  Create New Project                   ✕  │
├──────────────────────────────────────────┤
│                                          │
│  Project name                            │
│  ┌──────────────────────────────────┐    │
│  │ my-saas-app                      │    │
│  └──────────────────────────────────┘    │
│                                          │
│  Start from                              │
│                                          │
│  ○ Blank           ● SaaS Dashboard      │
│  ○ Landing Page    ○ Blog                │
│  ○ E-commerce                            │
│                                          │
│  [template preview thumbnail]            │
│                                          │
│         [Cancel]  [Create Project]       │
│                                          │
└──────────────────────────────────────────┘
```

- Name field auto-slugifies (spaces → hyphens, lowercase)
- Template selection shows a thumbnail preview
- "Create Project" → creates project + scaffolds template → redirects to workspace

### 2.4 Project Workspace

The main working screen. Five panels in a flexible layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Dashboard    Project Name    [⚙ Settings]  [🚀 Deploy]          │
├──────────┬───────────┬───────────────────────────────────────────────┤
│          │           │                                               │
│  Chat    │  Tasks    │   ┌─ Files ──────┬── Preview ──────────────┐  │
│          │           │   │              │                         │  │
│  Agent:  │  ☑ Task 1 │   │ ▼ src/      │  ┌───────────────────┐  │  │
│  Built   │  ☑ Task 2 │   │   ▼ app/    │  │                   │  │  │
│  the     │  ▶ Task 3 │   │     page.tsx │  │   Live Preview    │  │  │
│  pricing │  ○ Task 4 │   │     layout…  │  │                   │  │  │
│  page.   │  ○ Task 5 │   │   ▼ comp/   │  │                   │  │  │
│          │           │   │     Header…  │  │  ┌─ Toolbar ────┐ │  │  │
│  You:    │           │   │     Pricing… │  │  │ 🎯 📸 ⚠ 💬  │ │  │  │
│  Make    │           │   │ package.json │  │  └──────────────┘ │  │  │
│  the     │           │   ├──────────────┤  └───────────────────┘  │  │
│  button  │           │   │              │                         │  │
│  green.  │           │   │ // page.tsx  │  [Preview] [Console]    │  │
│          │           │   │ export def…  │                         │  │
│  ┌─────┐ │           │   │              │                         │  │
│  │ msg │ │           │   │              │                         │  │
│  └─────┘ │           │   └──────────────┴─────────────────────────┘  │
├──────────┴───────────┴───────────────────────────────────────────────┤
│  [Chat input: "Describe what you want to build or change..."]  [⏎]  │
└──────────────────────────────────────────────────────────────────────┘
```

**Layout rules:**
- Left column: Chat (fixed, always visible) + Tasks (collapsible)
- Right area: Files (editor) + Preview (side by side, resizable)
- Chat input always pinned to bottom
- Panels are resizable via drag handles
- On narrow screens: tabbed layout (Chat | Files | Preview)

---

## 3. UX Flows

### 3.1 New User — First Project

```
Login
  │
  ▼
Dashboard (empty state)
  │ Click "Create your first project"
  ▼
New Project Modal
  │ Name: "my-first-app"
  │ Template: SaaS Dashboard
  │ Click "Create Project"
  ▼
Workspace opens
  │ Template files loaded in Files panel
  │ Preview boots (WebContainer → npm install → next dev)
  │ Chat shows system message: "Project created from SaaS Dashboard template.
  │   Describe what you'd like to build, or say 'deploy' to ship as-is."
  ▼
User types: "Add a settings page with profile editing and notification preferences"
  │
  ▼
Planner Agent responds with task list (appears in Tasks panel)
  │
  ▼
Builder Agent starts executing tasks
  │ Files appear in Files panel
  │ Preview updates via HMR
  │ Task statuses update in real time
  ▼
All tasks complete
  │ Chat: "All done! Preview looks good. Say 'deploy' when ready."
  ▼
User types: "deploy"
  │
  ▼
Deploy Agent deploys to Vercel
  │ Build logs stream in chat
  │ Deploy card appears with production URL
  ▼
Done — user has a live app
```

### 3.2 Iterate with Toolbar

```
User viewing preview
  │
  │ Clicks element selector (🎯) in toolbar
  ▼
Toolbar enters selection mode
  │ User hovers over elements (blue outline follows cursor)
  │ User clicks a button
  ▼
Toolbar captures:
  - Component path: src/components/Header.tsx
  - CSS selector: button.cta-primary
  - Screenshot of the element
  │
  ▼
Context appears in chat: [screenshot] "Selected: button in Header.tsx"
  │
  ▼
User types: "Make this bigger, green background, and add an icon"
  │
  ▼
Builder Agent receives message + toolbar context
  │ Reads Header.tsx
  │ Edits the button (Tailwind classes + lucide-react icon)
  │ Runs typecheck → passes
  ▼
Preview updates via HMR (~1s)
  │
  ▼
User sees the change instantly in the preview
```

### 3.3 Error Recovery via Toolbar

```
User navigating preview
  │
  ▼
Runtime error occurs (e.g., undefined property access)
  │
  ▼
Toolbar catches via window.onerror
  │ Red error badge appears on toolbar (⚠)
  ▼
User clicks error badge
  │
  ▼
Error details sent to chat:
  "Runtime Error in /dashboard page:
   TypeError: Cannot read properties of undefined (reading 'name')
   at UserProfile (src/components/UserProfile.tsx:12:34)"
  │
  ▼
Builder Agent receives error context
  │ Reads UserProfile.tsx
  │ Identifies the bug (missing null check)
  │ Fixes with optional chaining
  │ Runs typecheck → passes
  ▼
Preview updates — error resolved
  │
  ▼
Chat: "Fixed the error — added a null check for the user object in UserProfile.tsx."
```

### 3.4 Deploy Failure Recovery

```
User says "deploy"
  │
  ▼
Deploy Agent triggers build
  │ Build logs streaming in chat
  ▼
Vercel build fails
  │ Error: "Module not found: Can't resolve '@/lib/db'"
  ▼
Deploy Agent analyzes logs
  │ This is a code issue, not config
  │ Calls hand_to_builder with error context
  ▼
Builder Agent:
  │ Reads the import, finds the file is missing
  │ Creates src/lib/db.ts with the expected exports
  │ Runs typecheck → passes
  ▼
Orchestrator triggers Deploy Agent again
  │
  ▼
Build succeeds → production URL returned
  │
  ▼
Chat: "Fixed the missing module and redeployed. Here's your URL: https://..."
```

### 3.5 Mid-Build User Interruption

```
Builder Agent working on Task 3 of 5
  │
  ▼
User types: "Actually, I don't want a blog section. Replace it with a FAQ page."
  │
  ▼
Orchestrator:
  │ Pauses Builder (finishes current file write, does not start next task)
  │ Routes to Planner Agent with: new message + current task list + current files
  ▼
Planner Agent:
  │ Marks blog-related tasks as removed
  │ Adds new FAQ tasks in their place
  │ Preserves completed tasks 1-2
  │ Returns updated task list
  ▼
Tasks panel updates (blog tasks gone, FAQ tasks added)
  │
  ▼
Builder Agent resumes from the first new task
```

---

## 4. Component Inventory

### 4.1 Global Components

| Component | Description |
|---|---|
| `TopBar` | Logo, search (dashboard) or project name + actions (workspace), avatar menu |
| `AvatarMenu` | Dropdown: user name, email, "Settings" (future), "Sign out" |
| `ProjectCard` | Dashboard grid item: name, status, URL, timestamp. Click → navigate to workspace. |
| `NewProjectModal` | Modal with name input + template grid. Creates project on submit. |

### 4.2 Workspace — Chat Panel

| Component | Description |
|---|---|
| `ChatPanel` | Container: message list + input bar |
| `MessageList` | Scrollable, reverse-chronological. Auto-scrolls to bottom on new messages. Scroll-up to load history. |
| `ChatMessage` | Renders one message. Variants by role: user (right-aligned, blue), agent (left-aligned, gray), system (centered, muted). |
| `RichBlock` | Embedded in messages. Types: `FileDiff`, `TaskListCard`, `DeployCard`, `ToolbarContext`, `ErrorBlock` |
| `FileDiff` | Syntax-highlighted diff view (green/red lines). Collapsible. Click filename → opens in editor. |
| `DeployCard` | Status badge, URL (clickable), timestamp. Shows build progress if building. |
| `ToolbarContext` | Screenshot thumbnail + element info. Shown when a message originated from toolbar interaction. |
| `ChatInput` | Text input, submit on Enter (Shift+Enter for newline). Attachment area for toolbar context. Disabled with spinner when agent is working. |
| `AgentThinking` | Animated indicator ("Planner is thinking..." / "Builder is writing code...") |

### 4.3 Workspace — Tasks Panel

| Component | Description |
|---|---|
| `TasksPanel` | Collapsible sidebar section. Header: "Tasks (3/5 done)" |
| `TaskItem` | Checkbox (done/pending), title, expand arrow. Click expands description. Status colors: green (done), blue (in progress), gray (pending), red (failed). |
| `TaskProgress` | Progress bar at the top showing overall completion. |

### 4.4 Workspace — Files Panel

| Component | Description |
|---|---|
| `FilesPanel` | Split: file tree (left narrow) + editor (right wide) |
| `FileTree` | Recursive tree view. Folders collapsible. Icons by file type. Highlights files currently being edited by agent (pulsing indicator). |
| `CodeEditor` | Monaco editor instance. Loads file content on click. Saves on Cmd+S (debounced). Shows "edited by Builder" banner when agent modifies the open file. |
| `EditorTabs` | Tab bar above editor for open files. Close button per tab. Unsaved indicator (dot). |

### 4.5 Workspace — Preview Panel

| Component | Description |
|---|---|
| `PreviewPanel` | Container: toolbar toggle, iframe, console drawer |
| `PreviewIframe` | Sandboxed iframe pointing to WebContainer dev server URL. Refreshes on HMR. Shows loading skeleton during WebContainer boot. |
| `PreviewToolbar` | Floating bar inside the iframe (injected). Buttons: element selector, screenshot, error reporter, quick prompt, console. |
| `ConsoleDrawer` | Collapsible panel below preview showing recent console.log output from the preview app. "Send to chat" button per entry. |

### 4.6 Workspace — Deploy Section

| Component | Description |
|---|---|
| `DeployButton` | Top bar button. States: "Deploy" (ready), "Deploying..." (building), "● Live" (deployed, shows URL on hover). |
| `DeployHistory` | Expandable section in project settings or inline in chat. Lists past deploys: status, URL, timestamp, triggered by. |

---

## 5. Interaction Patterns

### 5.1 Real-Time Updates

Everything in the workspace updates in real time via WebSocket. No polling.

| Event | UI Update |
|---|---|
| Agent sends message chunk | Chat message streams in (typewriter effect) |
| Agent writes a file | File tree updates, editor updates if file is open, preview HMRs |
| Task status changes | Tasks panel checkbox animates, progress bar updates |
| Deploy status changes | Deploy button state changes, deploy card in chat updates |
| Toolbar event | Context block appears in chat, input focuses |

### 5.2 Optimistic UI

| Action | Optimistic behavior |
|---|---|
| User sends message | Message appears immediately in chat (grayed until server confirms) |
| User saves a file | File saved locally to WebContainer immediately. S3 save in background. |
| User clicks "Deploy" | Button shows "Deploying..." immediately |

### 5.3 Loading States

| State | What the user sees |
|---|---|
| Project opening | Skeleton panels. Chat loads first (fastest), then tasks, then files, then preview (WebContainer boot, ~5-10s) |
| WebContainer booting | Preview panel shows progress: "Installing dependencies..." → "Starting dev server..." → live preview |
| Agent working | Thinking indicator in chat. Tasks panel shows current task as "in progress" with pulsing dot. |
| Deploy building | Build log streaming in chat. Deploy button shows spinner. |

### 5.4 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Enter` | Send chat message |
| `Cmd+S` | Save current file in editor |
| `Cmd+P` | Quick file open (fuzzy search) |
| `Cmd+B` | Toggle file tree sidebar |
| `Cmd+J` | Toggle console drawer |
| `Cmd+Shift+D` | Trigger deploy |
| `Escape` | Cancel toolbar selection mode |

---

## 6. Responsive Behavior

### Desktop (>1200px)
- Full layout: Chat + Tasks (left) | Files + Preview (right), all visible

### Tablet (768–1200px)
- Chat + Tasks (left, narrower) | Files OR Preview (right, tabbed)

### Mobile (<768px)
- Bottom tab bar: Chat | Tasks | Files | Preview
- One panel visible at a time
- Chat input fixed at bottom of Chat tab
- Toolbar still functional in Preview tab

---

## 7. Theming

MVP ships with **dark mode only** (reduces design decisions, matches developer tooling convention).

| Token | Value |
|---|---|
| `--bg-primary` | `#0a0a0a` (near black) |
| `--bg-secondary` | `#141414` (panels) |
| `--bg-tertiary` | `#1e1e1e` (inputs, cards) |
| `--border` | `#2a2a2a` |
| `--text-primary` | `#fafafa` |
| `--text-secondary` | `#a0a0a0` |
| `--accent` | `#3b82f6` (blue-500) |
| `--success` | `#22c55e` (green-500) |
| `--error` | `#ef4444` (red-500) |
| `--warning` | `#f59e0b` (amber-500) |

Light mode is post-MVP (add CSS variables toggle, no structural changes needed).

---

## 8. Wireframe Summary

### Screen count: 4
1. Login
2. Dashboard
3. Workspace
4. Project Settings (minimal: rename, env vars, delete)

### Modal count: 2
1. New Project
2. Delete Project confirmation

### Unique components: ~25
See component inventory in section 4.

---

*This completes the initial design document set. Next step: implementation.*
