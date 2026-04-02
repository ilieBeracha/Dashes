"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertCircle, Eye } from "lucide-react";

interface ComponentPreviewProps {
  projectId: string;
  componentName: string;
  filePath: string;
  hasPreviewFile: boolean;
}

export function ComponentPreview({
  projectId,
  componentName,
  filePath,
  hasPreviewFile,
}: ComponentPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sourceContent, setSourceContent] = useState<string | null>(null);

  // For components without a preview file, fetch the source and display a
  // rendered props/structure view
  useEffect(() => {
    if (hasPreviewFile) {
      setSourceContent(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(
      `/api/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`
    )
      .then((res) => (res.ok ? res.text() : ""))
      .then((content) => {
        setSourceContent(content);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load component source");
        setLoading(false);
      });
  }, [projectId, filePath, hasPreviewFile, refreshKey]);

  const previewUrl = hasPreviewFile
    ? `/api/projects/${projectId}/preview?component=${encodeURIComponent(componentName)}`
    : null;

  useEffect(() => {
    if (hasPreviewFile) {
      setLoading(true);
      setError(null);
    }
  }, [componentName, refreshKey, hasPreviewFile]);

  // Auto-preview: parse component source to extract structure
  if (!hasPreviewFile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-8 items-center justify-between border-b border-border bg-bg-tertiary px-3">
          <span className="text-[11px] font-medium text-text-secondary">
            Preview: {componentName}
          </span>
          <button
            onClick={() => setRefreshKey((prev: number) => prev + 1)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-bg-primary p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading preview...
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <AlertCircle className="h-6 w-6 text-error" />
                <p className="text-xs text-text-secondary">{error}</p>
              </div>
            </div>
          ) : sourceContent ? (
            <AutoPreview source={sourceContent} componentName={componentName} />
          ) : null}
        </div>
      </div>
    );
  }

  // Dedicated preview file: render in iframe
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center justify-between border-b border-border bg-bg-tertiary px-3">
        <span className="text-[11px] font-medium text-text-secondary">
          Preview: {componentName}
        </span>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

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
                onClick={() => setRefreshKey((prev: number) => prev + 1)}
                className="mt-1 rounded bg-bg-tertiary px-3 py-1 text-xs text-text-primary transition-colors hover:bg-border"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <iframe
          key={refreshKey}
          src={previewUrl!}
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

/**
 * Auto-generated preview from component source code.
 * Extracts props interface, exported function name, and renders a visual
 * representation of the component's structure.
 */
function AutoPreview({
  source,
  componentName,
}: {
  source: string;
  componentName: string;
}) {
  const analysis = analyzeComponent(source, componentName);

  return (
    <div className="space-y-4">
      {/* Component header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
          <Eye className="h-4 w-4 text-accent" />
        </div>
        <div>
          <div className="text-sm font-medium text-text-primary">
            {analysis.name}
          </div>
          <div className="text-[11px] text-text-secondary">
            {analysis.isClient ? "Client Component" : "Server Component"}
            {analysis.hasDefaultExport ? " · Default Export" : " · Named Export"}
          </div>
        </div>
      </div>

      {/* Props */}
      {analysis.props.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Props
          </div>
          <div className="space-y-1.5">
            {analysis.props.map((prop) => (
              <div
                key={prop.name}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-accent">{prop.name}</span>
                  {prop.optional && (
                    <span className="text-[10px] text-text-secondary">?</span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-text-secondary">
                  {prop.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Imports */}
      {analysis.imports.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Dependencies
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.imports.map((imp) => (
              <span
                key={imp}
                className="rounded-full bg-bg-tertiary px-2.5 py-0.5 font-mono text-[11px] text-text-secondary"
              >
                {imp}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hooks */}
      {analysis.hooks.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Hooks Used
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.hooks.map((hook) => (
              <span
                key={hook}
                className="rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent"
              >
                {hook}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* JSX Structure */}
      {analysis.jsxElements.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Renders
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.jsxElements.map((el, i) => (
              <span
                key={`${el}-${i}`}
                className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${
                  el[0] === el[0].toUpperCase()
                    ? "bg-accent/10 text-accent"
                    : "bg-bg-tertiary text-text-secondary"
                }`}
              >
                {"<"}{el}{" />"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-text-secondary">
        Add a preview file at __previews__/{componentName}.preview.tsx for a live rendered preview
      </div>
    </div>
  );
}

interface ComponentAnalysis {
  name: string;
  isClient: boolean;
  hasDefaultExport: boolean;
  props: { name: string; type: string; optional: boolean }[];
  imports: string[];
  hooks: string[];
  jsxElements: string[];
}

function analyzeComponent(source: string, fallbackName: string): ComponentAnalysis {
  const analysis: ComponentAnalysis = {
    name: fallbackName,
    isClient: false,
    hasDefaultExport: false,
    props: [],
    imports: [],
    hooks: [],
    jsxElements: [],
  };

  // Check "use client"
  analysis.isClient = /["']use client["']/.test(source);

  // Check default export
  analysis.hasDefaultExport = /export\s+default/.test(source);

  // Extract component name from export
  const fnMatch = source.match(
    /export\s+(?:default\s+)?function\s+(\w+)/
  );
  if (fnMatch) analysis.name = fnMatch[1];

  // Extract props from interface or type
  const propsMatch = source.match(
    /(?:interface|type)\s+\w*Props\w*\s*(?:=\s*)?\{([^}]+)\}/
  );
  if (propsMatch) {
    const propsBody = propsMatch[1];
    const propRegex = /(\w+)(\??):\s*([^;,\n]+)/g;
    let m;
    while ((m = propRegex.exec(propsBody)) !== null) {
      analysis.props.push({
        name: m[1],
        optional: m[2] === "?",
        type: m[3].trim(),
      });
    }
  }

  // Extract import sources
  const importRegex = /from\s+["']([^"']+)["']/g;
  let imp;
  const seen = new Set<string>();
  while ((imp = importRegex.exec(source)) !== null) {
    const src = imp[1];
    if (!seen.has(src)) {
      seen.add(src);
      analysis.imports.push(src);
    }
  }

  // Extract hooks
  const hookRegex = /\buse[A-Z]\w+/g;
  let h;
  const hooksSeen = new Set<string>();
  while ((h = hookRegex.exec(source)) !== null) {
    if (!hooksSeen.has(h[0])) {
      hooksSeen.add(h[0]);
      analysis.hooks.push(h[0]);
    }
  }

  // Extract JSX elements (both HTML and React components)
  const jsxRegex = /<(\w+)[\s/>]/g;
  let j;
  const jsxSeen = new Set<string>();
  while ((j = jsxRegex.exec(source)) !== null) {
    const el = j[1];
    if (!jsxSeen.has(el) && el !== "div" && el !== "span" && el !== "p") {
      jsxSeen.add(el);
      analysis.jsxElements.push(el);
    }
  }

  return analysis;
}
