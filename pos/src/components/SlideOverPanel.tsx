import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@ury/ui';
import { t } from '../i18n';

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Anchors the sheet to the leading edge instead of the trailing one. */
  side?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The tablet stand-in for a docked panel.
 *
 * Below 1024px the order panel and the order-details panel cannot stay parked
 * on the edge of the screen — 384px of a 768px tablet leaves no menu to read
 * (UX-06). They move in here instead: same content, opened deliberately,
 * closed by Escape, the backdrop or the close button.
 *
 * Direction comes from `start`/`end` and the document's own `dir`, so the
 * sheet arrives from the trailing edge in both Arabic and English rather than
 * from a hardcoded right.
 */
export default function SlideOverPanel({
  isOpen,
  onClose,
  title,
  side = 'end',
  className,
  children,
}: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    panelRef.current?.focus();

    /**
     * A dialog opened from inside the sheet owns the keyboard.
     *
     * Customising a line opens ProductDialog *within* this panel, and it has
     * its own Escape handler. Without this guard one Escape dismissed both,
     * so correcting an item's options threw away the whole order sheet.
     */
    const insideNestedDialog = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      const dialog = active.closest('[role="dialog"]');
      return Boolean(dialog) && dialog !== panelRef.current;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (insideNestedDialog()) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const els = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      ).filter((el) => el.offsetParent !== null);
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      // Back to whatever opened the sheet, so closing the order resumes the
      // menu at the item the cashier was on.
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="presentation">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex h-full w-full max-w-md flex-col bg-[#fffdf8] shadow-2xl outline-none',
          side === 'end' ? 'ms-auto border-s' : 'me-auto border-e',
          'border-[#eadfce]',
          className
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#eadfce] px-4 py-3">
          <h2 className="text-base font-bold text-[#3f2a20]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8f6b55] transition-colors hover:bg-[#fff0cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
