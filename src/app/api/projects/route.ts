import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/projects — list all projects for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.userId, session.user.id),
        eq(projects.status, "active")
      )
    )
    .orderBy(desc(projects.updatedAt));

  return NextResponse.json(result);
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, templateId } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [project] = await db
    .insert(projects)
    .values({
      userId: session.user.id,
      name,
      templateId: templateId || null,
    })
    .returning();

  // TODO: If templateId is set, scaffold template files to S3

  return NextResponse.json(project, { status: 201 });
}
