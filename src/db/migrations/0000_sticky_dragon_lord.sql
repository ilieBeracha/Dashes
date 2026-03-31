CREATE TYPE "public"."deploy_status" AS ENUM('queued', 'building', 'ready', 'error', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."env_var_target" AS ENUM('production', 'preview', 'development');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'planner', 'builder', 'deploy', 'system');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "deploys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"vercel_deploy_id" text NOT NULL,
	"url" text,
	"status" "deploy_status" DEFAULT 'queued' NOT NULL,
	"build_log" text,
	"error_message" text,
	"commit_message" text,
	"triggered_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tool_calls" jsonb,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_env_vars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_encrypted" "bytea" NOT NULL,
	"targets" "env_var_target"[] DEFAULT '{"production","preview"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"path" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"s3_key" text NOT NULL,
	"last_modified_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"template_id" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"vercel_project_id" text,
	"vercel_team_id" text,
	"production_url" text,
	"current_agent" text,
	"has_active_plan" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"order_index" integer NOT NULL,
	"files" text[] DEFAULT '{}' NOT NULL,
	"depends_on" integer[] DEFAULT '{}' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_log" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
ALTER TABLE "deploys" ADD CONSTRAINT "deploys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_env_vars" ADD CONSTRAINT "project_env_vars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deploys_project_id" ON "deploys" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_project_id" ON "messages" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_env_vars_project_key" ON "project_env_vars" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "idx_env_vars_project_id" ON "project_env_vars" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_project_files_path" ON "project_files" USING btree ("project_id","path");--> statement-breakpoint
CREATE INDEX "idx_project_files_project_id" ON "project_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_projects_user_id" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_project_id" ON "tasks" USING btree ("project_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_users_github_id" ON "users" USING btree ("github_id");