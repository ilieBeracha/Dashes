"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TEMPLATES = [
  { id: "blank", name: "Blank", description: "Empty Next.js project" },
  { id: "saas-dashboard", name: "SaaS Dashboard", description: "Admin dashboard with sidebar nav and data tables" },
  { id: "landing-page", name: "Landing Page", description: "Marketing page with hero, features, and CTA" },
  { id: "blog", name: "Blog", description: "Blog with posts, tags, and MDX support" },
  { id: "ecommerce", name: "E-commerce", description: "Storefront with products, cart, and checkout" },
];

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId: string) => void;
}

export function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("blank");

  if (!open) return null;

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-border bg-bg-secondary p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create New Project</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-text-secondary">
            Project name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-awesome-app"
          />
          {slug && slug !== name && (
            <p className="mt-1 text-xs text-text-secondary">Slug: {slug}</p>
          )}
        </div>

        <div className="mb-6">
          <label className="mb-1.5 block text-sm text-text-secondary">
            Start from
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => setTemplateId(template.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  templateId === template.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-text-secondary"
                }`}
              >
                <div className="text-sm font-medium">{template.name}</div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  {template.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onCreate(slug || name, templateId)}
            disabled={!name.trim()}
          >
            Create Project
          </Button>
        </div>
      </div>
    </div>
  );
}
