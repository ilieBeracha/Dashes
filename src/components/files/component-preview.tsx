"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";

interface ComponentPreviewProps {
  projectId: string;
  componentName: string;
}

export function ComponentPreview({
  projectId,
  componentName,
}: ComponentPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const previewUrl = `/api/projects/${projectId}/preview?component=${encodeURIComponent(componentName)}`;

  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [componentName, refreshKey]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-8 items-center justify-between border-b border-border bg-bg-tertiary px-3">
        <span className="text-[11px] font-medium text-text-secondary">
          Preview: {componentName}
        </span>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
          title="Refresh preview"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Preview iframe */}
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading preview...
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary p-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <AlertCircle className="h-6 w-6 text-error" />
              <p className="text-xs text-text-secondary">{error}</p>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="mt-1 rounded bg-bg-tertiary px-3 py-1 text-xs text-text-primary transition-colors hover:bg-border"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <iframe
          key={refreshKey}
          src={previewUrl}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title={`Preview: ${componentName}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError("Failed to load preview");
          }}
        />
      </div>
    </div>
  );
}
