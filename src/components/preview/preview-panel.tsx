"use client";

import { useState } from "react";
import {
  Crosshair,
  Camera,
  AlertTriangle,
  MessageSquare,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  projectId: string;
}

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex h-9 items-center justify-between border-b border-border bg-bg-secondary px-3">
        <div className="flex gap-2">
          <button
            className={cn(
              "text-xs font-medium",
              !showConsole ? "text-text-primary" : "text-text-secondary"
            )}
            onClick={() => setShowConsole(false)}
          >
            Preview
          </button>
          <button
            className={cn(
              "text-xs font-medium",
              showConsole ? "text-text-primary" : "text-text-secondary"
            )}
            onClick={() => setShowConsole(true)}
          >
            Console
          </button>
        </div>
      </div>

      {!showConsole ? (
        <div className="relative flex-1 bg-bg-primary">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="App preview"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-tertiary">
                <Terminal className="h-8 w-8" />
              </div>
              <p className="text-sm">Preview will appear here</p>
              <p className="text-xs">
                Start a conversation to build your app
              </p>
            </div>
          )}

          {/* Preview Toolbar */}
          {previewUrl && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-bg-secondary/90 px-2 py-1.5 shadow-lg backdrop-blur">
              <ToolbarButton icon={Crosshair} label="Select element" />
              <ToolbarButton icon={Camera} label="Screenshot" />
              <ToolbarButton icon={AlertTriangle} label="Errors" />
              <ToolbarButton icon={MessageSquare} label="Quick prompt" />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-bg-primary p-3 font-mono text-xs">
          {consoleLogs.length === 0 ? (
            <p className="text-text-secondary">No console output yet</p>
          ) : (
            consoleLogs.map((log, i) => (
              <div key={i} className="border-b border-border py-1.5 text-text-secondary">
                {log}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
