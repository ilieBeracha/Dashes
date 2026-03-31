import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectSettingsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="flex h-12 items-center border-b border-border bg-bg-secondary px-4">
        <Link
          href={`/project/${id}`}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </Link>
      </header>

      <main className="mx-auto max-w-2xl p-8">
        <h1 className="mb-8 text-xl font-semibold">Project Settings</h1>

        {/* Name */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium">Project Name</h2>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm"
            placeholder="Project name"
          />
        </section>

        {/* Environment Variables */}
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium">Environment Variables</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Variables are encrypted and only sent to Vercel during deployment.
          </p>
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-sm text-text-secondary">
              No environment variables configured yet.
            </p>
          </div>
        </section>

        {/* Danger Zone */}
        <section>
          <h2 className="mb-2 text-sm font-medium text-error">Danger Zone</h2>
          <div className="rounded-lg border border-error/20 p-4">
            <p className="mb-3 text-sm text-text-secondary">
              Deleting a project removes all files, chat history, and deployments. This action cannot be undone.
            </p>
            <button className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90">
              Delete Project
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
