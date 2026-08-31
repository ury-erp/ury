import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@ury/ui';
import { buildDeskUrl } from '@ury/core';
import { getDeskPermission, DeskPermission } from '../services/deskLink';

/**
 * Links from read-only `/ury` screens to the real, editable Frappe desk
 * document behind them.
 *
 * Several screens here are deliberately read-only views over documents that
 * are still only editable in the desk (`URY Issue Wastage`, `URY Stock
 * Movement`, `POS Invoice`, `Work Order`, ...). Without a link the user has to
 * know the doctype's desk slug and search for the record by hand.
 *
 * The link is only rendered once the backend confirms the user actually has
 * `read` permission on the doctype -- a link that lands on the desk's "Not
 * Permitted" page is worse than no link. This is a UX gate, not a security
 * boundary: the desk enforces permissions on arrival regardless.
 *
 * The generated URL carries a `ury_return_to` param so the desk's
 * `return_to_app.js` can offer a "Back to URY" chip; see
 * `packages/core/src/frappe/deskLink.ts`.
 */

export interface DeskLinkProps {
  /** Doctype of the target document, e.g. `'URY Issue Wastage'`. */
  doctype: string;
  /** Docname (`name`) of the target document. */
  name?: string | null;
  /** Link text. Defaults to `'Open in Desk'`. */
  label?: string;
  /** Render as a bare icon with an accessible label (for tight table cells). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Doctype-level desk permission for the current user.
 *
 * Returns `null` while the probe is in flight so callers can render nothing
 * rather than flashing a link that may be withdrawn.
 */
export const useDeskPermission = (doctype: string): DeskPermission | null => {
  const [permission, setPermission] = useState<DeskPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPermission(null);
    if (!doctype) return undefined;
    getDeskPermission(doctype).then((result) => {
      if (!cancelled) setPermission(result);
    });
    return () => {
      cancelled = true;
    };
  }, [doctype]);

  return permission;
};

export const DeskLink: React.FC<DeskLinkProps> = ({
  doctype,
  name,
  label = 'Open in Desk',
  iconOnly = false,
  className,
}) => {
  const permission = useDeskPermission(doctype);

  if (!name || !permission?.read) return null;

  const href = buildDeskUrl(doctype, name);
  const title = `${label}: ${doctype} ${name}`;

  if (iconOnly) {
    return (
      <a
        href={href}
        title={title}
        aria-label={title}
        data-testid="desk-link"
        className={cn(
          'inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-primary',
          className
        )}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    );
  }

  return (
    <a
      href={href}
      title={title}
      data-testid="desk-link"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline',
        className
      )}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  );
};

export default DeskLink;
