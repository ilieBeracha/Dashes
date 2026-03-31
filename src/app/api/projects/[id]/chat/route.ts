import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, messages, tasks } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { routeMessage, callAgent } from "@/lib/agents/orchestrator";

// Allow up to 60 seconds for agent calls
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/projects/:id/chat — send a message to the project chat
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

  // Save user message
  await db.insert(messages).values({
    projectId: id,
    role: "user",
    content,
    metadata: toolbarContext ? { toolbar: toolbarContext } : {},
  });

  // Get recent messages for context
  const recentMessages = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.projectId, id))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  // Get current tasks
  const currentTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, id))
    .orderBy(tasks.orderIndex);

  const hasPendingTasks = currentTasks.some(
    (t) => t.status === "pending" || t.status === "in_progress"
  );
  const allTasksDone =
    currentTasks.length > 0 && currentTasks.every((t) => t.status === "done");

  // Route to the right agent
  const agentType = routeMessage(
    project.hasActivePlan,
    hasPendingTasks,
    allTasksDone,
    content,
    !!toolbarContext
  );

  // Call the agent
  const agentResponse = await callAgent(agentType, {
    projectId: id,
    recentMessages: recentMessages.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    })),
    taskList: currentTasks.map((t) => ({
      title: t.title,
      description: t.description,
      status: t.status,
    })),
    fileManifest: [], // TODO: load from project_files
    relevantFiles: [], // TODO: load relevant files from S3
    toolbarContext: toolbarContext || undefined,
  });

  // Save agent response
  const [savedMessage] = await db
    .insert(messages)
    .values({
      projectId: id,
      role: agentType,
      content: agentResponse.content,
      toolCalls: agentResponse.toolCalls,
    })
    .returning();

  // If planner created tasks, save them
  let savedTasks = currentTasks;
  if (agentResponse.tasks) {
    // Clear existing pending tasks
    await db
      .delete(tasks)
      .where(
        and(eq(tasks.projectId, id), eq(tasks.status, "pending"))
      );

    // Insert new tasks
    const newTasks = await db
      .insert(tasks)
      .values(
        agentResponse.tasks.map((t, i) => ({
          projectId: id,
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
      .where(eq(projects.id, id));

    savedTasks = newTasks;
  }

  return NextResponse.json({
    message: savedMessage,
    tasks: savedTasks,
    agentType,
  });
}
