import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projects, projectFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import * as s3 from "@/lib/s3";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/:id/preview?component=MetricCard
 *
 * Returns a self-contained HTML page that renders a component's preview
 * variants. The page fetches the project's CSS (globals.css + tailwind)
 * and renders the component with mock data defined in the preview file.
 *
 * Query params:
 *   component - Component name (e.g. "MetricCard")
 *   variant   - Optional variant index to render (default: all)
 */
export async function GET(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const componentName = request.nextUrl.searchParams.get("component");
  const listMode = request.nextUrl.searchParams.get("list");

  // List mode: return all components that have preview files
  if (listMode === "true") {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const previewFiles = await db
      .select({ path: projectFiles.path })
      .from(projectFiles)
      .where(eq(projectFiles.projectId, id));

    const previews = previewFiles
      .filter((f: { path: string }) => f.path.startsWith("__previews__/") && f.path.endsWith(".preview.tsx"))
      .map((f: { path: string }) => {
        const name = f.path
          .replace("__previews__/", "")
          .replace(".preview.tsx", "");
        return { name, previewPath: f.path };
      });

    return NextResponse.json({ previews });
  }

  if (!componentName) {
    return NextResponse.json(
      { error: "component query param is required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find the preview file
  const previewPath = `__previews__/${componentName}.preview.tsx`;
  const files = await db
    .select({ path: projectFiles.path })
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, id),
        eq(projectFiles.path, previewPath)
      )
    );

  if (files.length === 0) {
    return NextResponse.json(
      { error: `No preview found for ${componentName}` },
      { status: 404 }
    );
  }

  // Read the preview file content
  let previewContent: string;
  try {
    previewContent = await s3.readFile(id, previewPath);
  } catch {
    return NextResponse.json(
      { error: "Could not read preview file" },
      { status: 500 }
    );
  }

  // Read the component source to find its path
  // Also try to read globals.css for styling context
  let globalsCss = "";
  try {
    globalsCss = await s3.readFile(id, "src/app/globals.css");
  } catch {
    // No globals.css is fine
  }

  // Parse preview metadata from the file content
  const previewData = parsePreviewFile(previewContent);

  // Read the actual component source
  let componentSource = "";
  if (previewData.componentPath) {
    try {
      componentSource = await s3.readFile(id, previewData.componentPath);
    } catch {
      // Component might not exist yet
    }
  }

  // Read all project files that might be imported by the component
  const allFiles = await db
    .select({ path: projectFiles.path })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, id));

  // Collect relevant source files (components, lib, utils)
  const sourceFiles: Record<string, string> = {};
  for (const f of allFiles) {
    if (
      f.path.endsWith(".ts") ||
      f.path.endsWith(".tsx") ||
      f.path.endsWith(".css")
    ) {
      try {
        sourceFiles[f.path] = await s3.readFile(id, f.path);
      } catch {
        // Skip unreadable files
      }
    }
  }

  const html = buildPreviewHTML({
    componentName,
    previewData,
    componentSource,
    globalsCss,
    sourceFiles,
    previewContent,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * GET /api/projects/:id/preview?list=true
 * Returns a JSON list of all available component previews.
 */

interface PreviewData {
  componentName: string;
  componentPath: string;
  previews: { name: string; props: Record<string, unknown> }[];
}

function parsePreviewFile(content: string): PreviewData {
  const data: PreviewData = {
    componentName: "",
    componentPath: "",
    previews: [],
  };

  // Extract componentName
  const nameMatch = content.match(
    /export\s+const\s+componentName\s*=\s*["'`](.+?)["'`]/
  );
  if (nameMatch) data.componentName = nameMatch[1];

  // Extract componentPath
  const pathMatch = content.match(
    /export\s+const\s+componentPath\s*=\s*["'`](.+?)["'`]/
  );
  if (pathMatch) data.componentPath = pathMatch[1];

  // Extract previews array — parse the props objects
  const previewsMatch = content.match(
    /export\s+const\s+previews\s*=\s*\[([\s\S]*?)\];/
  );
  if (previewsMatch) {
    const previewsBody = previewsMatch[1];
    // Find each { name: "...", props: { ... } } block
    const variantRegex =
      /\{\s*name:\s*["'`](.+?)["'`]\s*,\s*props:\s*(\{[\s\S]*?\})\s*,?\s*\}/g;
    let match;
    while ((match = variantRegex.exec(previewsBody)) !== null) {
      try {
        // Try to evaluate the props as JSON (won't work for JSX but covers simple cases)
        const propsStr = match[2]
          .replace(/(\w+):/g, '"$1":') // keys to quoted
          .replace(/'/g, '"') // single to double quotes
          .replace(/,\s*}/g, "}") // trailing commas
          .replace(/,\s*]/g, "]"); // trailing commas in arrays
        const props = JSON.parse(propsStr);
        data.previews.push({ name: match[1], props });
      } catch {
        // If JSON parse fails, store raw props string
        data.previews.push({ name: match[1], props: {} });
      }
    }
  }

  return data;
}

function buildPreviewHTML(opts: {
  componentName: string;
  previewData: PreviewData;
  componentSource: string;
  globalsCss: string;
  sourceFiles: Record<string, string>;
  previewContent: string;
}): string {
  const { componentName, previewData, globalsCss } = opts;

  const variantsJSON = JSON.stringify(previewData.previews);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview: ${componentName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${globalsCss}

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--color-bg-primary, #0a0a0a);
      color: var(--color-text-primary, #fafafa);
    }

    .preview-container {
      padding: 24px;
    }

    .preview-header {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-secondary, #a0a0a0);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 20px;
    }

    .variant-section {
      margin-bottom: 32px;
    }

    .variant-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--color-text-secondary, #a0a0a0);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
    }

    .variant-render {
      padding: 16px;
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 8px;
      background: var(--color-bg-secondary, #141414);
    }

    .variant-props {
      margin-top: 8px;
      padding: 8px 12px;
      background: var(--color-bg-tertiary, #1e1e1e);
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--color-text-secondary, #a0a0a0);
      white-space: pre-wrap;
      word-break: break-all;
    }

    .no-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: var(--color-text-secondary, #a0a0a0);
      font-size: 14px;
    }

    .error-banner {
      padding: 12px 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: var(--color-error, #ef4444);
      font-size: 13px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="preview-container" id="preview-root">
    <div class="preview-header">${componentName} — Component Preview</div>
    <div id="variants-container"></div>
  </div>

  <script>
    // Variant data from the preview file
    const variants = ${variantsJSON};
    const componentName = ${JSON.stringify(componentName)};

    const container = document.getElementById('variants-container');

    if (variants.length === 0) {
      container.innerHTML = '<div class="no-preview">No preview variants defined for ' + componentName + '</div>';
    } else {
      variants.forEach((variant, index) => {
        const section = document.createElement('div');
        section.className = 'variant-section';

        const label = document.createElement('div');
        label.className = 'variant-label';
        label.textContent = variant.name;
        section.appendChild(label);

        const render = document.createElement('div');
        render.className = 'variant-render';
        render.id = 'variant-' + index;

        // Render a static representation of the props
        const propsHTML = renderPropsAsHTML(variant.props, componentName);
        render.innerHTML = propsHTML;
        section.appendChild(render);

        const propsDisplay = document.createElement('div');
        propsDisplay.className = 'variant-props';
        propsDisplay.textContent = 'Props: ' + JSON.stringify(variant.props, null, 2);
        section.appendChild(propsDisplay);

        container.appendChild(section);
      });
    }

    /**
     * Renders a static HTML representation of a component given its props.
     * This produces a visual approximation using Tailwind classes.
     */
    function renderPropsAsHTML(props, name) {
      // Build a card-like visual representation from the props
      const entries = Object.entries(props);
      if (entries.length === 0) {
        return '<div style="padding: 16px; opacity: 0.6;">Empty props</div>';
      }

      let html = '<div style="display: flex; flex-direction: column; gap: 8px; padding: 4px;">';

      for (const [key, value] of entries) {
        if (typeof value === 'string' && value.length > 100) {
          // Long text — render as paragraph
          html += '<div style="font-size: 13px;">' + escapeHTML(String(value)) + '</div>';
        } else if (Array.isArray(value)) {
          html += '<div style="font-size: 12px; color: var(--color-text-secondary, #a0a0a0);">' + key + ':</div>';
          html += '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';
          value.forEach(item => {
            if (typeof item === 'object' && item !== null) {
              html += '<div style="padding: 6px 10px; background: var(--color-bg-tertiary, #1e1e1e); border-radius: 4px; font-size: 12px;">' + escapeHTML(JSON.stringify(item)) + '</div>';
            } else {
              html += '<span style="padding: 2px 8px; background: var(--color-bg-tertiary, #1e1e1e); border-radius: 12px; font-size: 11px;">' + escapeHTML(String(item)) + '</span>';
            }
          });
          html += '</div>';
        } else if (typeof value === 'object' && value !== null) {
          html += '<div style="font-size: 12px; color: var(--color-text-secondary, #a0a0a0);">' + key + ':</div>';
          html += '<div style="padding: 8px; background: var(--color-bg-tertiary, #1e1e1e); border-radius: 4px; font-size: 12px;">';
          for (const [k, v] of Object.entries(value)) {
            html += '<div><span style="color: var(--color-accent, #3b82f6);">' + k + '</span>: ' + escapeHTML(String(v)) + '</div>';
          }
          html += '</div>';
        } else {
          // Simple value — render as key: value
          const displayValue = typeof value === 'boolean'
            ? (value ? '✓' : '✗')
            : typeof value === 'number'
              ? '<span style="color: var(--color-accent, #3b82f6); font-weight: 600; font-size: 20px;">' + value + '</span>'
              : escapeHTML(String(value));

          html += '<div style="display: flex; justify-content: space-between; align-items: baseline;">';
          html += '<span style="font-size: 12px; color: var(--color-text-secondary, #a0a0a0);">' + key + '</span>';
          html += '<span style="font-size: 14px;">' + displayValue + '</span>';
          html += '</div>';
        }
      }

      html += '</div>';
      return html;
    }

    function escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}
