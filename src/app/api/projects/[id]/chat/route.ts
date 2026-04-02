import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, messages, tasks, projectFiles } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { routeMessage, callAgent } from "@/lib/agents/orchestrator";
import { executeTool } from "@/lib/agents/tool-executor";

// Allow up to 600 seconds — building many tasks takes time
export const maxDuration = 600;

// Per-task timeout: 120 seconds per individual builder task
const TASK_TIMEOUT_MS = 120_000;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Send an SSE event to the client.
 */
function sendEvent(
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown
) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
}

// POST /api/projects/:id/chat — send a message to the project chat (SSE stream)
export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { content, toolbarContext } = body;

  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  // Verify ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runAgentPipeline(controller, id, content, toolbarContext, project);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        sendEvent(controller, "error", { error: message });
      } finally {
        sendEvent(controller, "done", {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Creates a tool executor that streams progress to the SSE client.
 * After file-mutating tools (write/delete), immediately pushes an
 * updated file list so the UI stays in sync during the build.
 */
function createStreamingToolExecutor(
  controller: ReadableStreamDefaultController,
  projectId: string
) {
  return async (
    toolName: string,
    _toolId: string,
    input: Record<string, unknown>
  ) => {
    sendEvent(controller, "tool_exec", {
      tool: toolName,
      input:
        toolName === "write_file"
          ? { path: input.path }
          : toolName === "delete_file"
            ? { path: input.path }
            : toolName === "read_file"
              ? { path: input.path }
              : input,
    });

    const result = await executeTool(projectId, toolName, input);

    if (!result.success) {
      sendEvent(controller, "tool_error", {
        tool: toolName,
        error: result.output,
      });
    }

    // After any file mutation, immediately push updated file list
    if (
      result.success &&
      (toolName === "write_file" || toolName === "delete_file")
    ) {
      const updatedFiles = await db
        .select({ path: projectFiles.path })
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId));
      sendEvent(controller, "files", {
        files: updatedFiles.map((f) => f.path),
      });
    }

    return result;
  };
}

async function runAgentPipeline(
  controller: ReadableStreamDefaultController,
  projectId: string,
  content: string,
  toolbarContext: Record<string, unknown> | undefined,
  project: { hasActivePlan: boolean }
) {
  // Save user message
  await db.insert(messages).values({
    projectId,
    role: "user",
    content,
    metadata: toolbarContext ? { toolbar: toolbarContext } : {},
  });

  // Get recent messages for context
  const recentMessages = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.projectId, projectId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  // Get current tasks
  const currentTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.orderIndex);

  const hasPendingTasks = currentTasks.some(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
  const allTasksDone =
    currentTasks.length > 0 && currentTasks.every((t) => t.status === "done");

  // Get file manifest
  const fileList = await db
    .select({ path: projectFiles.path })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));
  const fileManifest = fileList.map((f) => f.path);

  // Route to the right agent
  const agentType = routeMessage(
    project.hasActivePlan,
    hasPendingTasks,
    allTasksDone,
    content,
    !!toolbarContext
  );

  sendEvent(controller, "status", {
    agent: agentType,
    message:
      agentType === "planner"
        ? "Analyzing your request..."
        : agentType === "builder"
          ? "Preparing to build..."
          : "Preparing deployment...",
  });

  // --- BUILDER with pending tasks: go straight to the task loop ---
  if (agentType === "builder" && hasPendingTasks) {
    // Save an acknowledgement message so the user sees a response
    const ackContent = `Continuing to build... ${currentTasks.filter((t) => t.status === "pending" || t.status === "in_progress").length} tasks remaining.`;
    const [ackMessage] = await db
      .insert(messages)
      .values({ projectId, role: "builder", content: ackContent })
      .returning();

    sendEvent(controller, "message", {
      message: ackMessage,
      agentType: "builder",
    });

    await runBuilderLoop(controller, projectId, currentTasks);

    // Send final file list
    const updatedFiles = await db
      .select({ path: projectFiles.path })
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));
    sendEvent(controller, "files", {
      files: updatedFiles.map((f) => f.path),
    });
    return;
  }

  // --- PLANNER or BUILDER without tasks or DEPLOY: single agent call ---
  const toolExecutor = createStreamingToolExecutor(controller, projectId);

  const agentResponse = await callAgent(
    agentType,
    {
      projectId,
      recentMessages: recentMessages.reverse().map((m) => ({
        role: m.role,
        content: m.content,
      })),
      taskList: currentTasks.map((t) => ({
        title: t.title,
        description: t.description,
        status: t.status,
      })),
      fileManifest,
      relevantFiles: [],
      toolbarContext: toolbarContext || undefined,
    },
    toolExecutor
  );

  // Save agent response — synthesize content if the agent only used tools
  const agentContent =
    agentResponse.content.trim() ||
    (agentResponse.tasks && agentResponse.tasks.length > 0
      ? `I've created a plan with ${agentResponse.tasks.length} task${agentResponse.tasks.length === 1 ? "" : "s"}. Starting to build now.`
      : agentResponse.toolCalls.length > 0
        ? summarizeToolCalls(agentResponse.toolCalls)
        : "Done.");

  const [savedMessage] = await db
    .insert(messages)
    .values({
      projectId,
      role: agentType,
      content: agentContent,
      toolCalls: agentResponse.toolCalls,
    })
    .returning();

  sendEvent(controller, "message", { message: savedMessage, agentType });

  // If planner created tasks, save them and auto-trigger builder
  if (agentResponse.tasks && agentResponse.tasks.length > 0) {
    sendEvent(controller, "status", {
      agent: "planner",
      message: `Created ${agentResponse.tasks.length} tasks`,
    });

    // Clear existing pending tasks
    await db
      .delete(tasks)
      .where(
        and(eq(tasks.projectId, projectId), eq(tasks.status, "pending"))
      );

    // Insert new tasks
    const newTasks = await db
      .insert(tasks)
      .values(
        agentResponse.tasks.map((t, i) => ({
          projectId,
          title: t.title,
          description: t.description,
          orderIndex: i,
          files: t.files,
          dependsOn: t.dependsOn ?? [],
        }))
      )
      .returning();

    // Mark project as having an active plan
    await db
      .update(projects)
      .set({ hasActivePlan: true, currentAgent: "planner" })
      .where(eq(projects.id, projectId));

    sendEvent(controller, "tasks", { tasks: newTasks });

    // Auto-trigger builder to start executing tasks
    sendEvent(controller, "status", {
      agent: "builder",
      message: "Starting to build...",
    });

    await runBuilderLoop(controller, projectId, newTasks);
  }

  // Send final file list
  const updatedFiles = await db
    .select({ path: projectFiles.path })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId));
  sendEvent(controller, "files", { files: updatedFiles.map((f) => f.path) });
}

/**
 * Run the builder agent in a loop, executing one task at a time.
 * Each task gets a full agentic tool-use loop (multi-turn).
 * Processes tasks that are pending or stuck in_progress.
 */
async function runBuilderLoop(
  controller: ReadableStreamDefaultController,
  projectId: string,
  taskList: (typeof tasks.$inferSelect)[]
) {
  // Pick up pending tasks AND tasks stuck in "in_progress" (from a previous failed run)
  const workableTasks = taskList.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  );

  for (const task of workableTasks) {
    // Mark task as in_progress (idempotent if already in_progress)
    await db
      .update(tasks)
      .set({ status: "in_progress", startedAt: new Date() })
      .where(eq(tasks.id, task.id));

    sendEvent(controller, "task_status", {
      taskId: task.id,
      status: "in_progress",
      title: task.title,
    });

    sendEvent(controller, "status", {
      agent: "builder",
      message: `Working on: ${task.title}`,
    });

    try {
      // Get fresh context
      const recentMessages = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.projectId, projectId))
        .orderBy(desc(messages.createdAt))
        .limit(10);

      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, projectId))
        .orderBy(tasks.orderIndex);

      const fileList = await db
        .select({ path: projectFiles.path })
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId));
      const currentManifest = fileList.map((f) => f.path);

      const toolExecutor = createStreamingToolExecutor(controller, projectId);

      // Call builder agent with full tool-use loop + per-task timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, TASK_TIMEOUT_MS);

      let builderResponse;
      try {
        builderResponse = await callAgent(
          "builder",
          {
            projectId,
            recentMessages: [
              ...recentMessages.reverse().map((m) => ({
                role: m.role,
                content: m.content,
              })),
              {
                role: "user",
                content: `Execute this task now:\n\nTitle: ${task.title}\nDescription: ${task.description}\nFiles: ${(task.files ?? []).join(", ")}`,
              },
            ],
            taskList: allTasks.map((t) => ({
              title: t.title,
              description: t.description,
              status: t.status,
            })),
            fileManifest: currentManifest,
            relevantFiles: [],
          },
          toolExecutor,
          abortController.signal
        );
      } catch (err) {
        if (abortController.signal.aborted) {
          throw new Error(`Task timed out after ${TASK_TIMEOUT_MS / 1000}s`);
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

      // Determine outcome
      const taskFailed = !!builderResponse.handoff;
      const finalStatus = taskFailed ? "failed" : "done";

      await db
        .update(tasks)
        .set({
          status: finalStatus,
          completedAt: new Date(),
          attempts: task.attempts + 1,
          errorLog: taskFailed ? "Escalated to planner" : null,
        })
        .where(eq(tasks.id, task.id));

      sendEvent(controller, "task_status", {
        taskId: task.id,
        status: finalStatus,
        title: task.title,
      });

      // Always save builder response as a message
      const builderContent =
        builderResponse.content.trim() ||
        summarizeToolCalls(builderResponse.toolCalls, task.title);

      const [builderMessage] = await db
        .insert(messages)
        .values({
          projectId,
          role: "builder",
          content: builderContent,
          toolCalls: builderResponse.toolCalls,
        })
        .returning();

      sendEvent(controller, "message", {
        message: builderMessage,
        agentType: "builder",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await db
        .update(tasks)
        .set({
          status: "failed",
          completedAt: new Date(),
          attempts: task.attempts + 1,
          errorLog: errorMessage,
        })
        .where(eq(tasks.id, task.id));

      sendEvent(controller, "task_status", {
        taskId: task.id,
        status: "failed",
        title: task.title,
      });

      sendEvent(controller, "status", {
        agent: "builder",
        message: `Task failed: ${task.title}`,
      });

      // Save error as a message so the user sees it after refresh
      await db.insert(messages).values({
        projectId,
        role: "system",
        content: `Task "${task.title}" failed: ${errorMessage}`,
      });

      sendEvent(controller, "message", {
        message: {
          id: crypto.randomUUID(),
          projectId,
          role: "system",
          content: `Task "${task.title}" failed: ${errorMessage}`,
          createdAt: new Date(),
        },
        agentType: "system",
      });
    }
  }

  // Update project agent state
  const finalTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  const allDone = finalTasks.every((t) => t.status === "done");

  await db
    .update(projects)
    .set({
      currentAgent: null,
      hasActivePlan: !allDone,
    })
    .where(eq(projects.id, projectId));

  sendEvent(controller, "status", {
    agent: "builder",
    message: allDone ? "All tasks completed!" : "Some tasks need attention",
  });

  sendEvent(controller, "tasks", { tasks: finalTasks });
}

/**
 * Generate a human-readable summary from tool calls when the agent
 * produced no text content.
 */
function summarizeToolCalls(
  toolCalls: { toolName: string; input: Record<string, unknown> }[],
  taskTitle?: string
): string {
  if (toolCalls.length === 0) {
    return taskTitle ? `Completed: ${taskTitle}` : "Done.";
  }

  const writes = toolCalls
    .filter((tc) => tc.toolName === "write_file")
    .map((tc) => tc.input.path as string);
  const deletes = toolCalls
    .filter((tc) => tc.toolName === "delete_file")
    .map((tc) => tc.input.path as string);
  const packages = toolCalls
    .filter((tc) => tc.toolName === "install_package")
    .map((tc) => tc.input.package_name as string);

  const parts: string[] = [];

  if (taskTitle) {
    parts.push(`**${taskTitle}**`);
  }

  if (writes.length > 0) {
    parts.push(
      writes.length <= 3
        ? `Created: ${writes.join(", ")}`
        : `Created ${writes.length} files`
    );
  }

  if (deletes.length > 0) {
    parts.push(`Deleted: ${deletes.join(", ")}`);
  }

  if (packages.length > 0) {
    parts.push(`Installed: ${packages.join(", ")}`);
  }

  return parts.join("\n") || (taskTitle ? `Completed: ${taskTitle}` : "Done.");
}
