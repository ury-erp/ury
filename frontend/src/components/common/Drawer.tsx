import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@ury/ui';
import { t } from '../../i18n';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-full',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'lg',
  className,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  /**
   * Escape, a focus trap, and focus restoration.
   *
   * Escape was already handled, but focus was not: opening the drawer left
   * the caret wherever it had been, Tab walked straight out into the page
   * behind the backdrop, and closing dropped focus onto <body> — so a
   * keyboard user lost their place entirely (UX-17). A modal surface has to
   * own focus for as long as it is covering the page.
   */
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Focus the panel itself rather than its first control: moving straight
    // into a field skips the heading that says what this drawer is.
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const els = focusable();
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

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      // Back where they were, so closing a drawer resumes the form rather
      // than restarting the tab order from the top of the document.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 ease-in-out"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Slide-over panel container */}
      <div className="fixed inset-y-0 end-0 flex max-w-full ps-10">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cn(
            'w-screen transform bg-white shadow-2xl transition-transform duration-300 ease-in-out flex flex-col',
            sizeClasses[size],
            className
          )}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 bg-white flex items-center justify-between sticky top-0 z-10">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
              </div>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-1 ps-4">{subtitle}</p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={t('dash.drawer.close_panel')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
            {children}
          </div>

          {/* Optional Footer */}
          {footer && (
            <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 z-10">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Drawer;
