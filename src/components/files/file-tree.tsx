"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTreeProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  previewSet?: Set<string>;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export function FileTree({
  files,
  activeFile,
  onSelectFile,
  previewSet,
}: FileTreeProps) {
  const tree = buildTree(files);

  if (files.length === 0) {
    return (
      <p className="px-2 py-4 text-xs text-text-secondary">No files yet</p>
    );
  }

  return (
    <div className="text-sm">
      {tree.map((node) => (
        <TreeNodeItem
          key={node.path}
          node={node}
          activeFile={activeFile}
          onSelectFile={onSelectFile}
          previewSet={previewSet}
          depth={0}
        />
      ))}
    </div>
  );
}

function TreeNodeItem({
  node,
  activeFile,
  onSelectFile,
  previewSet,
  depth,
}: {
  node: TreeNode;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  previewSet?: Set<string>;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasPreview = previewSet?.has(node.path) ?? false;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-bg-tertiary"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-text-secondary" />
          ) : (
            <ChevronRight className="h-3 w-3 text-text-secondary" />
          )}
          <Folder className="h-3.5 w-3.5 text-accent" />
          <span>{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              previewSet={previewSet}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-bg-tertiary",
        activeFile === node.path && "bg-accent/15 text-accent"
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <File className="h-3.5 w-3.5 text-text-secondary" />
      <span className="flex-1 truncate text-left">{node.name}</span>
      {hasPreview && (
        <Eye
          className="h-3 w-3 shrink-0 text-accent opacity-60"
          title="Preview available"
        />
      )}
    </button>
  );
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const path of paths.sort()) {
    const parts = path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const existingPath = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);

      if (!existing) {
        existing = {
          name,
          path: existingPath,
          isDir: !isLast,
          children: [],
        };
        current.push(existing);
      }

      if (!isLast) {
        current = existing.children;
      }
    }
  }

  return sortTree(root);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: sortTree(node.children),
    }));
}
