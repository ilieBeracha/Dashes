import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          default: "bg-bg-tertiary text-text-secondary",
          success: "bg-success/15 text-success",
          warning: "bg-warning/15 text-warning",
          error: "bg-error/15 text-error",
        }[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
