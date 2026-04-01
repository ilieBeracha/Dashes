import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, messages, tasks, projectFiles } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { routeMessage, callAgent } from "@/lib/agents/orchestrator";
import { executeTool } from "@/lib/agents/tool-executor";

// Allow up to 120 seconds for agent calls (planning + building)
export const maxDuration = 120;

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
    // Stream what the agent is doing
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

  const toolExecutor = createStreamingToolExecutor(controller, projectId);

  // Call the agent with the tool-use loop
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

  // Save agent response
  const [savedMessage] = await db
    .insert(messages)
    .values({
      projectId,
      role: agentType,
      content: agentResponse.content,
      toolCalls: agentResponse.toolCalls,
    })
    .returning();

  sendEvent(controller, "message", { message: savedMessage, agentType });

  // If planner created tasks, save them and auto-trigger builder
  let savedTasks = currentTasks;
  if (agentResponse.tasks && agentResponse.tasks.length > 0) {
    sendEvent(controller, "status", {
      agent: "planner",
      message: `Created ${agentResponse.tasks.length} tasks`,
    });

    // Clear existing pending tasks
    await db
      .delete(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "pending")));

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
      .set({ hasActivePlan: true, currentAgent: agentType })
      .where(eq(projects.id, projectId));

    savedTasks = newTasks;
    sendEvent(controller, "tasks", { tasks: savedTasks });

    // Auto-trigger builder to start executing tasks
    sendEvent(controller, "status", {
      agent: "builder",
      message: "Starting to build...",
    });

    await runBuilderLoop(controller, projectId, savedTasks);
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
 */
async function runBuilderLoop(
  controller: ReadableStreamDefaultController,
  projectId: string,
  taskList: (typeof tasks.$inferSelect)[]
) {
  const pendingTasks = taskList.filter((t) => t.status === "pending");

  for (const task of pendingTasks) {
    // Mark task as in_progress
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

      // Call builder agent with full tool-use loop
      const builderResponse = await callAgent(
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
        toolExecutor
      );

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

      // Save builder response as a message
      if (builderResponse.content) {
        const [builderMessage] = await db
          .insert(messages)
          .values({
            projectId,
            role: "builder",
            content: builderResponse.content,
            toolCalls: builderResponse.toolCalls,
          })
          .returning();

        sendEvent(controller, "message", {
          message: builderMessage,
          agentType: "builder",
        });
      }
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
