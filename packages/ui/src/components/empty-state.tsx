import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** Defaults to a generic inbox glyph -- pass a more specific lucide icon per page. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

/**
 * Shared "nothing here yet" pattern: icon + message + optional single action.
 * Use this instead of a bespoke `<p>No X found.</p>` block wherever a list/table/
 * dashboard section can legitimately have zero rows -- it keeps the empty
 * treatment consistent across pages instead of every page inventing its own.
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hair px-6 py-12 text-center",
        className
      )}
    >
      <Icon className="mb-1 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && (
        <Button size="sm" variant="outline" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
