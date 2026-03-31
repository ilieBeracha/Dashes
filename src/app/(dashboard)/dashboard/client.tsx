"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { signOut } from "next-auth/react";
import { TopBar } from "@/components/dashboard/top-bar";
import { ProjectCard } from "@/components/dashboard/project-card";
import { NewProjectModal } from "@/components/dashboard/new-project-modal";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

interface DashboardClientProps {
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function DashboardClient({ user }: DashboardClientProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch projects on mount
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(name: string, templateId: string) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, templateId }),
    });
    if (res.ok) {
      const project = await res.json();
      setProjects((prev) => [project, ...prev]);
      setModalOpen(false);
      window.location.href = `/project/${project.id}`;
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        user={user}
        onSearch={setSearch}
        onSignOut={() => signOut({ callbackUrl: "/login" })}
      />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold">My Projects</h2>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <p className="text-text-secondary">Loading projects...</p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
              <p className="mb-4 text-text-secondary">
                {search
                  ? "No projects match your search"
                  : "Create your first project"}
              </p>
              {!search && (
                <Button onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
