import React, { useEffect, useMemo, useState } from 'react';
import { AttentionFeed, AttentionItemProps, Card, KpiStrip, Spinner } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import {
  AVAILABILITY_REASON_MESSAGES,
  AvailabilityReasonCode,
  ItemAvailability,
} from '../Pos/lib/availability-api';
import { ITEM_CHECK_LIMIT, menuAvailabilityService } from '../../services/menuAvailability';

/**
 * Deliberately narrow: this is NOT the full "Menu & Routing" mockup page
 * (Station / Recipe version / Routed via columns) -- that table needs a
 * Station entity and recipe versioning that don't exist anywhere in this
 * backend (see PLAN.md's `ctl/routing` audit entry). What DOES exist and is
 * real is `ury.ury.api.ury_availability.get_item_availability`, which
 * returns a per-item `sellable` boolean and machine-readable `reason_code`.
 * This page is exactly that data, surfaced honestly: which items in the
 * catalog can't be sold right now, grouped by the real reason the backend
 * gave, plus real counts. No Station/Recipe/Routed-via columns are shown
 * because no backend data source for them exists yet.
 */

/** Reason codes that mean "structurally can't be produced" (missing
 * config/BOM/production capability) vs. "produced but temporarily out" --
 * used only for AttentionFeed severity, mirrors the reason-code list
 * documented in `availability-api.ts` (taken verbatim from
 * `ury_availability.py`, the only authoritative source). */
const BLOCKING_REASON_CODES: ReadonlySet<string> = new Set<AvailabilityReasonCode>([
  'NOT_PRODUCED',
  'BLOCKING_COMPONENT',
  'MISSING_BOM',
  'MISSING_PRODUCTION_UNIT',
  'PRODUCTION_UNIT_DISABLED',
  'MISSING_DEPARTMENT',
  'DEPARTMENT_DISABLED',
  'CONFIGURATION_ERROR',
]);

const severityForReasonCode = (reasonCode: string): AttentionItemProps['severity'] =>
  BLOCKING_REASON_CODES.has(reasonCode) ? 'blocking' : 'warning';

const reasonLabel = (reasonCode: string): string => AVAILABILITY_REASON_MESSAGES[reasonCode] ?? reasonCode;

interface ReasonGroup {
  reasonCode: string;
  items: ItemAvailability[];
}

const groupByReasonCode = (items: ItemAvailability[]): ReasonGroup[] => {
  const groups = new Map<string, ItemAvailability[]>();
  for (const item of items) {
    const key = item.reason_code || 'UNKNOWN';
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return Array.from(groups.entries())
    .map(([reasonCode, groupItems]) => ({ reasonCode, items: groupItems }))
    .sort((a, b) => b.items.length - a.items.length);
};

const formatItemList = (items: ItemAvailability[], max = 8): string => {
  const codes = items.map((item) => item.item_code);
  if (codes.length <= max) return codes.join(', ');
  return `${codes.slice(0, max).join(', ')}, +${codes.length - max} more`;
};

export const MenuRoutingPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<ItemAvailability[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [catalogCount, setCatalogCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCheckedItems([]);
    setFailedCount(0);
    setCatalogCount(0);

    if (!activeBranchId || activeBranchId === 'all') {
      // Sellability is server-checked per branch (`get_item_availability`
      // requires a branch) -- there is no meaningful "all branches" merge.
      setError('Select a specific branch above to check menu sellability.');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const company = await menuAvailabilityService.resolveDefaultCompany();
        if (cancelled) return;
        if (!company) {
          setError('No company found for this workspace. Sellability cannot be checked without one.');
          setLoading(false);
          return;
        }

        const catalogItems = await menuAvailabilityService.listCatalogItems();
        if (cancelled) return;
        setCatalogCount(catalogItems.length);

        if (catalogItems.length === 0) {
          setLoading(false);
          return;
        }

        const { checked, failed } = await menuAvailabilityService.checkAvailability(
          catalogItems,
          activeBranchId,
          company,
        );
        if (cancelled) return;

        setCheckedItems(checked);
        setFailedCount(failed.length);
      } catch {
        if (!cancelled) {
          setError('Unable to check menu sellability for this branch.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  const unsellableItems = useMemo(() => checkedItems.filter((item) => !item.sellable), [checkedItems]);
  const sellableCount = checkedItems.length - unsellableItems.length;
  const reasonGroups = useMemo(() => groupByReasonCode(unsellableItems), [unsellableItems]);

  const attentionItems: AttentionItemProps[] = useMemo(
    () =>
      reasonGroups.map((group) => ({
        severity: severityForReasonCode(group.reasonCode),
        title: `${reasonLabel(group.reasonCode)} (${group.reasonCode})`,
        detail: formatItemList(group.items),
        amount: `${group.items.length} item${group.items.length === 1 ? '' : 's'}`,
      })),
    [reasonGroups],
  );

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Menu Sellability</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Real per-item availability from the server (`get_item_availability`) -- which catalog items can&apos;t be
          sold right now at this branch, and the server-reported reason. Station/recipe-version routing is not shown
          here; that data does not exist in the backend yet.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
      ) : (
        <>
          <KpiStrip
            items={[
              {
                label: 'Items checked',
                value: checkedItems.length,
                hint: catalogCount > checkedItems.length + failedCount
                  ? `of ${catalogCount} in catalog (capped at ${ITEM_CHECK_LIMIT})`
                  : `of ${catalogCount} in catalog`,
              },
              {
                label: 'Sellable',
                value: sellableCount,
                tone: 'success',
              },
              {
                label: 'Unsellable',
                value: unsellableItems.length,
                tone: unsellableItems.length > 0 ? 'danger' : 'default',
                hint: `${reasonGroups.length} reason${reasonGroups.length === 1 ? '' : 's'}`,
              },
              {
                label: 'Check failures',
                value: failedCount,
                tone: failedCount > 0 ? 'warning' : 'default',
                hint: failedCount > 0 ? 'Errored while checking -- excluded above' : 'None',
              },
            ]}
          />

          <AttentionFeed
            title="Unsellable items"
            items={
              attentionItems.length > 0
                ? attentionItems
                : [
                    {
                      severity: 'info',
                      title: 'Every checked item is sellable',
                      detail: `All ${checkedItems.length} checked item${checkedItems.length === 1 ? '' : 's'} came back sellable at this branch right now.`,
                    },
                  ]
            }
          />
        </>
      )}
    </div>
  );
};

export default MenuRoutingPage;
