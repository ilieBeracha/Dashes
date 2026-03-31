import {
  pgTable,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";

// --- Custom type for bytea ---

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// --- Enums ---

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "archived",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "planner",
  "builder",
  "deploy",
  "system",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "done",
  "failed",
]);

export const deployStatusEnum = pgEnum("deploy_status", [
  "queued",
  "building",
  "ready",
  "error",
  "canceled",
]);

export const envVarTargetEnum = pgEnum("env_var_target", [
  "production",
  "preview",
  "development",
]);

// --- Tables ---

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
    username: text("username").notNull(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_users_github_id").on(table.githubId)]
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    templateId: text("template_id"),
    status: projectStatusEnum("status").notNull().default("active"),
    vercelProjectId: text("vercel_project_id"),
    vercelTeamId: text("vercel_team_id"),
    productionUrl: text("production_url"),
    currentAgent: text("current_agent"),
    hasActivePlan: boolean("has_active_plan").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_projects_user_id").on(table.userId),
    index("idx_projects_status").on(table.userId, table.status),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    toolCalls: jsonb("tool_calls"),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_messages_project_id").on(table.projectId, table.createdAt),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: taskStatusEnum("status").notNull().default("pending"),
    orderIndex: integer("order_index").notNull(),
    files: text("files").array().notNull().default([]),
    dependsOn: integer("depends_on").array().notNull().default([]),
    attempts: integer("attempts").notNull().default(0),
    errorLog: text("error_log"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_tasks_project_id").on(table.projectId, table.orderIndex),
    index("idx_tasks_status").on(table.projectId, table.status),
  ]
);

export const deploys = pgTable(
  "deploys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    vercelDeployId: text("vercel_deploy_id").notNull(),
    url: text("url"),
    status: deployStatusEnum("status").notNull().default("queued"),
    buildLog: text("build_log"),
    errorMessage: text("error_message"),
    commitMessage: text("commit_message"),
    triggeredBy: text("triggered_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_deploys_project_id").on(table.projectId, table.createdAt),
  ]
);

export const projectEnvVars = pgTable(
  "project_env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEncrypted: bytea("value_encrypted").notNull(),
    targets: envVarTargetEnum("targets").array().notNull().default(["production", "preview"]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_env_vars_project_key").on(table.projectId, table.key),
    index("idx_env_vars_project_id").on(table.projectId),
  ]
);

export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    s3Key: text("s3_key").notNull(),
    lastModifiedBy: text("last_modified_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_project_files_path").on(table.projectId, table.path),
    index("idx_project_files_project_id").on(table.projectId),
  ]
);

// --- Type exports ---

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Deploy = typeof deploys.$inferSelect;
export type NewDeploy = typeof deploys.$inferInsert;
export type ProjectEnvVar = typeof projectEnvVars.$inferSelect;
export type ProjectFile = typeof projectFiles.$inferSelect;
