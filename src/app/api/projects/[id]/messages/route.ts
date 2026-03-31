import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, messages } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/projects/:id/messages — list messages for a project
export async function GET(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cursor = request.nextUrl.searchParams.get("before");
  const limit = 50;

  let query = db
    .select()
    .from(messages)
    .where(eq(messages.projectId, id))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const result = await query;

  // Return in chronological order
  return NextResponse.json(result.reverse());
}
