import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowRightLeft, Loader2, MoreVertical, Printer, Receipt, UserRound } from 'lucide-react';
import { Button } from '@ury/ui';

/**
 * Captain order screen's secondary-actions overflow menu (PLAN.md §5/§6/§10:
 * "⋯ View order / Reprint KOT / Transfer table / Transfer Captain / Print
 * bill"). "View order" is already the default screen, so this only surfaces
 * the remaining four.
 *
 * Follows the same overflow-menu convention already established in this app
 * (`TableActionsMenu.tsx` / `OrderActionsMenu.tsx`) — a `Button` + `MoreVertical`
 * trigger with an absolutely-positioned panel and click-outside-to-close —
 * rather than introducing a new `@ury/ui` primitive, since `@ury/ui` doesn't
 * yet ship a `DropdownMenu`/`Sheet` component.
 *
 * Every item is gated by its own `show*` flag, driven by the caller from
 * `useTableOrderContext()`'s real `permissions.*` fields — an item that
 * isn't permitted is not rendered at all, it is never shown disabled.
 */
interface CaptainActionsMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  showReprintKot?: boolean;
  onReprintKot?: () => void;
  isReprintingKot?: boolean;
  showTransferTable?: boolean;
  onTransferTable?: () => void;
  showTransferCaptain?: boolean;
  onTransferCaptain?: () => void;
  showPrintBill?: boolean;
  onPrintBill?: () => void;
  isPrintingBill?: boolean;
}

const CaptainActionsMenu = ({
  isOpen,
  onOpenChange,
  showReprintKot = false,
  onReprintKot,
  isReprintingKot = false,
  showTransferTable = false,
  onTransferTable,
  showTransferCaptain = false,
  onTransferCaptain,
  showPrintBill = false,
  onPrintBill,
  isPrintingBill = false,
}: CaptainActionsMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  if (!showReprintKot && !showTransferTable && !showTransferCaptain && !showPrintBill) {
    return null;
  }

  const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(!isOpen);
  };

  const handleReprintKot = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onReprintKot?.();
  };

  const handleTransferTable = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onTransferTable?.();
  };

  const handleTransferCaptain = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onTransferCaptain?.();
  };

  const handlePrintBill = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onPrintBill?.();
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleToggle}
        aria-label="More actions"
        aria-expanded={isOpen}
      >
        <MoreVertical className="h-5 w-5" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-white py-1 shadow-lg">
          {showReprintKot && (
            <Button
              variant="ghost"
              className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-muted"
              onClick={handleReprintKot}
              disabled={isReprintingKot}
            >
              {isReprintingKot ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Printer className="h-4 w-4 shrink-0" />
              )}
              Reprint KOT
            </Button>
          )}
          {showTransferTable && (
            <Button
              variant="ghost"
              className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-muted"
              onClick={handleTransferTable}
            >
              <ArrowRightLeft className="h-4 w-4 shrink-0" />
              Transfer table
            </Button>
          )}
          {showTransferCaptain && (
            <Button
              variant="ghost"
              className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-muted"
              onClick={handleTransferCaptain}
            >
              <UserRound className="h-4 w-4 shrink-0" />
              Transfer captain
            </Button>
          )}
          {showPrintBill && (
            <Button
              variant="ghost"
              className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-sm font-normal text-muted-foreground hover:bg-muted"
              onClick={handlePrintBill}
              disabled={isPrintingBill}
            >
              {isPrintingBill ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Receipt className="h-4 w-4 shrink-0" />
              )}
              Print bill
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default CaptainActionsMenu;
