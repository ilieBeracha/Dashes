import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const timeAgo = getTimeAgo(project.updatedAt);

  return (
    <Link
      href={`/project/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-bg-secondary p-5 transition-colors hover:border-accent/50"
    >
      <div className="flex items-start justify-between">
        <h3 className="font-semibold group-hover:text-accent">{project.name}</h3>
        <Badge variant={project.status === "active" ? "success" : "default"}>
          {project.status}
        </Badge>
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-text-secondary">
          {project.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between text-xs text-text-secondary">
        <span>Updated {timeAgo}</span>
        {project.productionUrl && (
          <span className="flex items-center gap-1 text-accent">
            <ExternalLink className="h-3 w-3" />
            Live
          </span>
        )}
      </div>
    </Link>
  );
}

function getTimeAgo(date: Date | string): string {
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
