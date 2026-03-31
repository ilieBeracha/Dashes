"use client";

import { useState, useEffect } from "react";
import { FileTree } from "./file-tree";
import { CodeEditor } from "./code-editor";

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
    fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(activeFile)}`)
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
          <span className="text-text-secondary">{activeFile}</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* File tree */}
        <div className="w-48 shrink-0 overflow-y-auto border-r border-border bg-bg-secondary p-2">
          <FileTree
            files={files}
            activeFile={activeFile}
            onSelectFile={onSelectFile}
          />
        </div>

        {/* Editor */}
        <div className="flex-1">
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
            <div className="flex h-full items-center justify-center text-sm text-text-secondary">
              Select a file to edit
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
