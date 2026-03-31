import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, deploys } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/projects/:id/deploy — trigger a deployment
export async function POST(_request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // TODO: Implement actual Vercel deployment
  // 1. Read all project files from S3
  // 2. Create Vercel project if not exists
  // 3. Upload files via Vercel Deployments API
  // 4. Return deployment status

  const [deploy] = await db
    .insert(deploys)
    .values({
      projectId: id,
      vercelDeployId: `dpl_placeholder_${Date.now()}`,
      status: "queued",
      triggeredBy: "user",
    })
    .returning();

  return NextResponse.json({
    deploy,
    message: {
      id: crypto.randomUUID(),
      projectId: id,
      role: "deploy",
      content: "Deployment queued. Vercel integration coming soon.",
      metadata: {
        blocks: [
          {
            type: "deploy_card",
            deployId: deploy.id,
            status: "queued",
          },
        ],
      },
      toolCalls: null,
      tokenCount: null,
      createdAt: new Date(),
    },
  });
}

// GET /api/projects/:id/deploy — list deployments
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await db
    .select()
    .from(deploys)
    .where(eq(deploys.projectId, id))
    .orderBy(deploys.createdAt);

  return NextResponse.json(result);
}
