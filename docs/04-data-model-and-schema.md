# Dashes — Data Model and Schema

> Version: 0.1
> Date: 2026-03-31
> Status: Draft
> Depends on: [01 — MVP Scope](./01-mvp-scope.md), [02 — System Architecture](./02-system-architecture.md), [03 — Agent Roles](./03-agent-roles-and-tool-permissions.md)

---

## 1. Overview

Dashes has two data stores:

| Store | Technology | What it holds |
|---|---|---|
| **PostgreSQL** (Neon) | Relational DB | Users, projects, messages, tasks, deploys, env vars, templates |
| **S3** (Cloudflare R2) | Object store | Project source files (the actual code agents write) |

This document defines the full schema for both.

---

## 2. PostgreSQL Schema

### 2.1 Entity Relationship Diagram

```
users
  │
  └──< projects
         │
         ├──< messages
         │
         ├──< tasks
         │
         ├──< deploys
         │
         ├──< project_env_vars
         │
         └──< project_files (metadata only)
```

### 2.2 Enums

```sql
CREATE TYPE project_status AS ENUM ('active', 'archived');

CREATE TYPE message_role AS ENUM (
  'user',
  'planner',
  'builder',
  'deploy',
  'system'
);

CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'done',
  'failed'
);

CREATE TYPE deploy_status AS ENUM (
  'queued',
  'building',
  'ready',
  'error',
  'canceled'
);

CREATE TYPE env_var_target AS ENUM (
  'production',
  'preview',
  'development'
);
```

### 2.3 Tables

#### `users`

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id     BIGINT NOT NULL UNIQUE,
  username      TEXT NOT NULL,
  email         TEXT,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_github_id ON users (github_id);
```

#### `projects`

```sql
CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  template_id       TEXT,                          -- references a template slug, nullable
  status            project_status NOT NULL DEFAULT 'active',
  vercel_project_id TEXT,                          -- set on first deploy
  vercel_team_id    TEXT,                          -- if deploying under a team
  production_url    TEXT,                          -- latest production URL
  current_agent     TEXT,                          -- 'planner' | 'builder' | 'deploy' | null
  has_active_plan   BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_user_id ON projects (user_id);
CREATE INDEX idx_projects_status ON projects (user_id, status);
```

#### `messages`

Stores the full chat history for each project — both user messages and agent responses.

```sql
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role          message_role NOT NULL,
  content       TEXT NOT NULL,                     -- plain text or markdown
  metadata      JSONB NOT NULL DEFAULT '{}',       -- rich blocks: diffs, cards, toolbar context
  tool_calls    JSONB,                             -- array of { tool_name, input, output }
  token_count   INT,                               -- for context window budgeting
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_project_id ON messages (project_id, created_at);
```

**`metadata` JSONB structure examples:**

```jsonc
// Agent message with file diff
{
  "blocks": [
    {
      "type": "file_diff",
      "path": "src/app/page.tsx",
      "diff": "--- a/src/app/page.tsx\n+++ b/src/app/page.tsx\n@@ -1,5 +1,10 @@..."
    }
  ]
}

// Message with toolbar context attached
{
  "toolbar": {
    "type": "element_selected",
    "component": "src/components/Header.tsx",
    "selector": "button.cta",
    "screenshot_url": "s3://dashes-screenshots/abc123/1711843200.png"
  }
}

// System message (deploy success)
{
  "blocks": [
    {
      "type": "deploy_card",
      "deploy_id": "dpl_abc123",
      "url": "https://my-app.vercel.app",
      "status": "ready"
    }
  ]
}
```

**`tool_calls` JSONB structure:**

```jsonc
[
  {
    "tool_name": "write_file",
    "input": { "path": "src/app/page.tsx", "content": "..." },
    "output": { "success": true }
  },
  {
    "tool_name": "run_typecheck",
    "input": {},
    "output": { "success": true, "errors": [] }
  }
]
```

#### `tasks`

```sql
CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  status        task_status NOT NULL DEFAULT 'pending',
  order_index   INT NOT NULL,
  files         TEXT[] NOT NULL DEFAULT '{}',       -- file paths this task touches
  depends_on    INT[] NOT NULL DEFAULT '{}',        -- order_index values of dependencies
  attempts      INT NOT NULL DEFAULT 0,             -- self-correction attempts by Builder
  error_log     TEXT,                               -- last error if failed
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project_id ON tasks (project_id, order_index);
CREATE INDEX idx_tasks_status ON tasks (project_id, status);
```

#### `deploys`

```sql
CREATE TABLE deploys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_deploy_id  TEXT NOT NULL,
  url               TEXT,                           -- production URL once ready
  status            deploy_status NOT NULL DEFAULT 'queued',
  build_log         TEXT,                           -- truncated build output
  error_message     TEXT,                           -- if status = error
  commit_message    TEXT,                           -- user-facing deploy description
  triggered_by      TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'agent' | 'auto'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_deploys_project_id ON deploys (project_id, created_at DESC);
```

#### `project_env_vars`

```sql
CREATE TABLE project_env_vars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value_encrypted BYTEA NOT NULL,                  -- encrypted at rest (AES-256-GCM)
  targets       env_var_target[] NOT NULL DEFAULT '{production,preview}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, key)
);

CREATE INDEX idx_env_vars_project_id ON project_env_vars (project_id);
```

#### `project_files` (metadata)

File contents live in S3. This table stores metadata for fast file tree rendering and tracking.

```sql
CREATE TABLE project_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,                     -- relative path: "src/app/page.tsx"
  size_bytes    INT NOT NULL DEFAULT 0,
  s3_key        TEXT NOT NULL,                     -- "{project_id}/{path}"
  last_modified_by TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'planner' | 'builder' | 'deploy' | 'template'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (project_id, path)
);

CREATE INDEX idx_project_files_project_id ON project_files (project_id);
```

### 2.4 Updated At Trigger

Auto-update `updated_at` on row modification:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_project_env_vars_updated_at
  BEFORE UPDATE ON project_env_vars FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_project_files_updated_at
  BEFORE UPDATE ON project_files FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 3. S3 (Cloudflare R2) — File Storage

### 3.1 Bucket Structure

```
Bucket: dashes-project-files

Key format:
  {project_id}/{relative_path}

Examples:
  550e8400-e29b-41d4-a716-446655440000/package.json
  550e8400-e29b-41d4-a716-446655440000/next.config.ts
  550e8400-e29b-41d4-a716-446655440000/src/app/page.tsx
  550e8400-e29b-41d4-a716-446655440000/src/app/layout.tsx
  550e8400-e29b-41d4-a716-446655440000/src/components/Header.tsx
  550e8400-e29b-41d4-a716-446655440000/public/favicon.ico
```

### 3.2 Operations

| Operation | When | How |
|---|---|---|
| **Write** | Agent creates/edits a file, user saves in editor | `PutObject` with full file content. Update `project_files` row. |
| **Read** | Editor opens a file, agent reads a file, deploy collects files | `GetObject` by key. |
| **Delete** | Agent deletes a file, user deletes in file tree | `DeleteObject`. Remove `project_files` row. |
| **List** | Project opens (bootstrap WebContainer), deploy collects all files | Query `project_files` table (not S3 ListObjects — faster, paginated). |
| **Bulk read** | Project open (fetch all files for WebContainer) | Parallel `GetObject` calls, batched by 20. |

### 3.3 File Size Limits

| Limit | Value | Rationale |
|---|---|---|
| Max single file | 1 MB | Source files. Images/assets should use public URLs or CDN. |
| Max files per project | 500 | Keeps WebContainer boot fast. Real projects rarely exceed this. |
| Max total project size | 50 MB | Generous for source code. Prevents abuse. |

### 3.4 Screenshots Bucket

Separate bucket for toolbar screenshots:

```
Bucket: dashes-screenshots

Key format:
  {project_id}/{timestamp}.png

TTL: 7 days (lifecycle policy auto-deletes)
```

---

## 4. Data Access Patterns

### 4.1 Dashboard (list projects)

```sql
SELECT id, name, description, status, production_url, updated_at
FROM projects
WHERE user_id = $1 AND status = 'active'
ORDER BY updated_at DESC
LIMIT 50;
```

### 4.2 Open Project (load workspace)

Parallel queries on project open:

```sql
-- 1. Project details
SELECT * FROM projects WHERE id = $1 AND user_id = $2;

-- 2. Recent messages (last 50 for initial load, paginate backward)
SELECT * FROM messages
WHERE project_id = $1
ORDER BY created_at DESC
LIMIT 50;

-- 3. Current tasks
SELECT * FROM tasks
WHERE project_id = $1
ORDER BY order_index;

-- 4. File manifest (for file tree + WebContainer bootstrap)
SELECT path, size_bytes, s3_key, last_modified_by, updated_at
FROM project_files
WHERE project_id = $1
ORDER BY path;

-- 5. Deploy history (last 10)
SELECT * FROM deploys
WHERE project_id = $1
ORDER BY created_at DESC
LIMIT 10;
```

### 4.3 Agent Context Assembly

When the Orchestrator prepares context for an agent call:

```sql
-- Recent messages for conversation context
SELECT role, content, tool_calls, created_at
FROM messages
WHERE project_id = $1
ORDER BY created_at DESC
LIMIT 20;

-- Active tasks
SELECT title, description, status, order_index, files
FROM tasks
WHERE project_id = $1
ORDER BY order_index;

-- File manifest (paths only, for agent awareness)
SELECT path FROM project_files
WHERE project_id = $1
ORDER BY path;
```

Then fetch relevant file contents from S3 (based on task's `files` array + import analysis).

### 4.4 Message Pagination

Chat loads the most recent 50 messages initially. Older messages loaded on scroll-up:

```sql
SELECT * FROM messages
WHERE project_id = $1
  AND created_at < $2  -- cursor: created_at of oldest loaded message
ORDER BY created_at DESC
LIMIT 50;
```

### 4.5 File Write (agent or user)

```sql
-- Upsert file metadata
INSERT INTO project_files (project_id, path, size_bytes, s3_key, last_modified_by)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (project_id, path)
DO UPDATE SET
  size_bytes = EXCLUDED.size_bytes,
  s3_key = EXCLUDED.s3_key,
  last_modified_by = EXCLUDED.last_modified_by;
```

```typescript
// S3 write (parallel with DB upsert)
await s3.putObject({
  Bucket: 'dashes-project-files',
  Key: `${projectId}/${path}`,
  Body: content,
  ContentType: getMimeType(path),
});
```

---

## 5. Template Data Model

Templates are not stored in the database. They are static definitions bundled with the app (in a `templates/` directory or a config file). Each template defines:

```typescript
interface Template {
  id: string;             // "blank" | "saas-dashboard" | "landing-page" | "blog" | "ecommerce"
  name: string;           // "SaaS Dashboard"
  description: string;    // "Admin dashboard with auth, sidebar nav, and data tables"
  thumbnail: string;      // URL to preview image
  files: TemplateFile[];  // files to scaffold
  packages: string[];     // npm packages to install
}

interface TemplateFile {
  path: string;           // "src/app/page.tsx"
  content: string;        // file content (can use {{project_name}} placeholders)
}
```

On project creation with a template:
1. Copy all template files to S3 under the new project ID
2. Insert `project_files` rows for each file
3. Record `template_id` on the project

---

## 6. Data Lifecycle

### 6.1 Project Creation

```
1. INSERT into projects (name, user_id, template_id)
2. If template selected:
   a. Read template file definitions
   b. Write each file to S3: {project_id}/{path}
   c. INSERT project_files rows for each file
3. Return project to client → redirect to workspace
```

### 6.2 Project Deletion

```
1. UPDATE projects SET status = 'archived' (soft delete)
   -- Messages, tasks, deploys preserved for potential recovery
   -- S3 files preserved (orphan cleanup job runs weekly)

Hard delete (user confirms):
1. DELETE FROM projects WHERE id = $1
   -- CASCADE deletes: messages, tasks, deploys, project_env_vars, project_files
2. Delete all S3 objects with prefix {project_id}/
3. Delete Vercel project via API (if exists)
```

### 6.3 Message Retention

- All messages retained indefinitely for MVP
- Post-MVP: archive messages older than 90 days to cold storage
- Token counts stored per message for billing prep (not used in v1)

### 6.4 Deploy Retention

- All deploy records retained
- Build logs truncated to 10KB after 30 days

---

## 7. Encryption and Sensitive Data

| Data | Storage | Protection |
|---|---|---|
| User sessions | httpOnly cookie (JWT) | Signed with app secret |
| GitHub OAuth tokens | NextAuth.js encrypted session | AES encryption via NextAuth |
| Project env vars | `project_env_vars.value_encrypted` | AES-256-GCM, key from `ENCRYPTION_KEY` env var |
| Vercel API token | Server env var only | Never stored in DB |
| Claude API key | Server env var only | Never stored in DB |
| File contents | S3 (R2) | Encrypted at rest (R2 default). Access scoped by project ownership check. |

### Encryption helper (for env vars):

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as: iv (16) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]);
}

export function decrypt(data: Buffer): string {
  const iv = data.subarray(0, 16);
  const tag = data.subarray(16, 32);
  const ciphertext = data.subarray(32);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
```

---

## 8. Migrations Strategy

Using **Drizzle ORM** for type-safe schema management and migrations:

```
/src
  /db
    schema.ts         -- Drizzle schema definitions (source of truth)
    index.ts          -- DB client export
    /migrations       -- Generated SQL migration files
      0001_initial.sql
      0002_add_env_vars.sql
      ...
```

- `drizzle-kit generate` produces SQL migrations from schema changes
- `drizzle-kit migrate` runs pending migrations
- Migrations run automatically on deploy via a build step
- Neon branching used for testing migrations against production-like data

---

*Next document: [05 — UX Flows and Dashboard Structure](./05-ux-flows-and-dashboard-structure.md)*
