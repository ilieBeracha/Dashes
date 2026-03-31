import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, projectFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import * as s3 from "@/lib/s3";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/projects/:id/files?path=... — read a file or list all files
export async function GET(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const path = request.nextUrl.searchParams.get("path");

  // Verify project ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (path) {
    // Read a single file
    const content = await s3.readFile(id, path);
    return new NextResponse(content, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // List all files
  const files = await db
    .select({
      path: projectFiles.path,
      sizeBytes: projectFiles.sizeBytes,
      lastModifiedBy: projectFiles.lastModifiedBy,
      updatedAt: projectFiles.updatedAt,
    })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, id))
    .orderBy(projectFiles.path);

  return NextResponse.json(files);
}

// PUT /api/projects/:id/files — write a file
export async function PUT(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { path, content } = body;

  if (!path || content === undefined) {
    return NextResponse.json(
      { error: "path and content are required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Write to S3
  await s3.writeFile(id, path, content);

  // Upsert metadata
  await db
    .insert(projectFiles)
    .values({
      projectId: id,
      path,
      sizeBytes: Buffer.byteLength(content, "utf8"),
      s3Key: `${id}/${path}`,
      lastModifiedBy: "user",
    })
    .onConflictDoUpdate({
      target: [projectFiles.projectId, projectFiles.path],
      set: {
        sizeBytes: Buffer.byteLength(content, "utf8"),
        lastModifiedBy: "user",
      },
    });

  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/:id/files?path=... — delete a file
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const path = request.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  await s3.deleteFile(id, path);

  await db
    .delete(projectFiles)
    .where(
      and(eq(projectFiles.projectId, id), eq(projectFiles.path, path))
    );

  return NextResponse.json({ ok: true });
}
