"use client";

import { useState, useEffect, useMemo } from "react";
import { FileTree } from "./file-tree";
import { CodeEditor } from "./code-editor";
import { ComponentPreview } from "./component-preview";
import { FolderOpen, Code, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "code" | "preview";

interface FilesPanelProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  projectId: string;
}

/**
 * Derive the component name from a file path, if it has a matching preview.
 * e.g. "src/components/MetricCard.tsx" → "MetricCard" (if __previews__/MetricCard.preview.tsx exists)
 */
function getPreviewableComponent(
  filePath: string,
  files: string[]
): string | null {
  if (!filePath) return null;

  // Only .tsx/.jsx component files (not pages, layouts, etc.)
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) return null;

  const fileName = filePath.split("/").pop() ?? "";
  // Skip Next.js convention files
  if (
    ["page.tsx", "layout.tsx", "loading.tsx", "error.tsx", "not-found.tsx"].includes(
      fileName
    )
  ) {
    return null;
  }

  // Derive component name from filename
  const componentName = fileName.replace(/\.(tsx|jsx)$/, "");

  // Check if a preview file exists
  const previewPath = `__previews__/${componentName}.preview.tsx`;
  if (files.includes(previewPath)) {
    return componentName;
  }

  return null;
}

export function FilesPanel({
  files,
  activeFile,
  onSelectFile,
  projectId,
}: FilesPanelProps) {
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("code");

  const previewableComponent = useMemo(
    () => (activeFile ? getPreviewableComponent(activeFile, files) : null),
    [activeFile, files]
  );

  // Reset to code view when switching to a file without preview
  useEffect(() => {
    if (!previewableComponent && viewMode === "preview") {
      setViewMode("code");
    }
  }, [previewableComponent, viewMode]);

  useEffect(() => {
    if (!activeFile) {
      setFileContent("");
      return;
    }

    setLoading(true);
    fetch(
      `/api/projects/${projectId}/files?path=${encodeURIComponent(activeFile)}`
    )
      .then((res) => (res.ok ? res.text() : ""))
      .then(setFileContent)
      .finally(() => setLoading(false));
  }, [activeFile, projectId]);

  async function handleSave(content: string) {
    if (!activeFile) return;
    await fetch(`/api/projects/${projectId}/files`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: activeFile, content }),
    });
  }

  // Collect which files have previews for the tree badges
  const previewSet = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      if (
        f.startsWith("__previews__/") &&
        f.endsWith(".preview.tsx")
      ) {
        const name = f.replace("__previews__/", "").replace(".preview.tsx", "");
        // Find the matching component file
        const match = files.find(
          (p) =>
            p.endsWith(`/${name}.tsx`) ||
            p.endsWith(`/${name}.jsx`) ||
            p === `${name}.tsx` ||
            p === `${name}.jsx`
        );
        if (match) set.add(match);
      }
    }
    return set;
  }, [files]);

  // Filter out __previews__ directory from the file tree
  const visibleFiles = useMemo(
    () => files.filter((f) => !f.startsWith("__previews__/")),
    [files]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      {activeFile && (
        <div className="flex h-9 items-center justify-between border-b border-border bg-bg-secondary px-3">
          <span className="truncate text-xs text-text-secondary">
            {activeFile}
          </span>
          {previewableComponent && (
            <div className="flex shrink-0 items-center rounded-md bg-bg-tertiary p-0.5">
              <button
                onClick={() => setViewMode("code")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  viewMode === "code"
                    ? "bg-bg-secondary text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Code className="h-3 w-3" />
                Code
              </button>
              <button
                onClick={() => setViewMode("preview")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  viewMode === "preview"
                    ? "bg-bg-secondary text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <div className="w-40 shrink-0 overflow-y-auto border-r border-border bg-bg-secondary p-1.5 sm:w-48 sm:p-2">
          <FileTree
            files={visibleFiles}
            activeFile={activeFile}
            onSelectFile={onSelectFile}
            previewSet={previewSet}
          />
        </div>

        {/* Editor or Preview */}
        <div className="min-w-0 flex-1">
          {activeFile ? (
            viewMode === "preview" && previewableComponent ? (
              <ComponentPreview
                projectId={projectId}
                componentName={previewableComponent}
              />
            ) : loading ? (
              <div className="flex h-full items-center justify-center text-sm text-text-secondary">
                Loading...
              </div>
            ) : (
              <CodeEditor
                value={fileContent}
                language={getLanguage(activeFile)}
                onChange={setFileContent}
                onSave={handleSave}
              />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-text-secondary">
              <FolderOpen className="h-8 w-8 opacity-40" />
              <p className="text-center text-xs">
                {files.length === 0
                  ? "No files yet — start a chat to build your app"
                  : "Select a file to view"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
  };
  return map[ext ?? ""] ?? "plaintext";
}
