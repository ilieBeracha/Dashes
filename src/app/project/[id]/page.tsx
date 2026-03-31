import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkspaceClient } from "./client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  return <WorkspaceClient projectId={id} user={session.user} />;
}
