"use client";

import { useState, useEffect } from "react";
import { FileTree } from "./file-tree";
import { CodeEditor } from "./code-editor";
import { FolderOpen } from "lucide-react";

interface FilesPanelProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  projectId: string;
}

export function FilesPanel({
  files,
  activeFile,
  onSelectFile,
  projectId,
}: FilesPanelProps) {
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      {activeFile && (
        <div className="flex h-9 items-center border-b border-border bg-bg-secondary px-3 text-xs">
          <span className="truncate text-text-secondary">{activeFile}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <div className="w-40 shrink-0 overflow-y-auto border-r border-border bg-bg-secondary p-1.5 sm:w-48 sm:p-2">
          <FileTree
            files={files}
            activeFile={activeFile}
            onSelectFile={onSelectFile}
          />
        </div>

        {/* Editor */}
        <div className="min-w-0 flex-1">
          {activeFile ? (
            loading ? (
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
