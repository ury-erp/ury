/**
 * @file SyncStatusBadge.tsx
 * @description Async sync-state badge for orders and tables.
 *
 * Renders a subtle, honest indicator of the local vs backend sync state:
 *   - Pending: local changes queued for the server
 *   - Failed:  a queued command for this entity has failed
 *
 * The badge never masks issues; it reflects the IndexedDB command queue state.
 */

import { useEffect, useState } from 'react';
import { CloudOff, AlertCircle } from 'lucide-react';
import { Badge } from '@ury/ui';
import { getOrderSyncBadgeState, getTableSyncBadgeState, type SyncBadgeState } from '../lib/sync-status';
import type { POSInvoice } from '../lib/invoice-api';
import { t } from '../i18n';

interface OrderSyncProps {
  /** Order id (may be a TEMP-* id or a server POS Invoice id). */
  orderId: string;
  /** Optional locally-known sync_status to avoid an extra order read. */
  syncStatus?: POSInvoice['sync_status'];
}

interface TableSyncProps {
  /** Table name whose active local order should be inspected. */
  tableName: string;
}

type SyncStatusBadgeProps = OrderSyncProps | TableSyncProps;

function isTableProps(props: SyncStatusBadgeProps): props is TableSyncProps {
  return 'tableName' in props;
}

export function SyncStatusBadge(props: SyncStatusBadgeProps) {
  const [state, setState] = useState<SyncBadgeState>(
    !isTableProps(props) && props.syncStatus === 'pending' ? 'pending' : 'synced'
  );

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const next = isTableProps(props)
        ? await getTableSyncBadgeState(props.tableName)
        : await getOrderSyncBadgeState({ name: props.orderId, sync_status: props.syncStatus });

      if (!cancelled) {
        setState(next);
      }
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [isTableProps(props) ? props.tableName : props.orderId, props.syncStatus]);

  if (state === 'synced') return null;

  if (state === 'failed') {
    return (
      <Badge
        variant="outline"
        className="shrink-0 gap-1 border-red-200 bg-red-50 text-red-700 hover:bg-red-50"
        title={t('orders.sync_failed_tooltip') || 'Sync failed — manual retry or resolution needed'}
      >
        <AlertCircle className="h-3 w-3" />
        {t('orders.sync_failed') || 'Sync Failed'}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
      title={t('orders.pending_sync_tooltip') || 'Pending sync — created or modified while offline'}
    >
      <CloudOff className="h-3 w-3" />
      {t('orders.pending_sync') || 'Pending Sync'}
    </Badge>
  );
}
