import React, { useEffect, useState } from 'react';
import { Badge, Card, DataTable, Page, Section, Spinner, type DataTableColumn } from '@ury/ui';
import { getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { DeskLink } from '../../components/DeskLink';
import {
  stockReservationService,
  StockReservationRow,
} from '../../services/stockReservation';

export const STOCK_RESERVATION_ALLOWED_ROLES = [
  'Production Manager',
  'Stock Manager',
  'System Manager',
];

const formatDateTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString();
};

const formatQty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'Reserved':
      return 'tagAccent' as const;
    case 'Fulfilled':
      return 'tagSuccess' as const;
    case 'Released':
      return 'cancelled' as const;
    case 'Expired':
      return 'tagWarning' as const;
    case 'Cancelled':
      return 'tagDestructive' as const;
    default:
      return 'cancelled' as const;
  }
};

interface StockReservationRoleGateProps {
  children: React.ReactNode;
}

export const StockReservationRoleGate: React.FC<StockReservationRoleGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getLoggedUser();
        if (!userId) {
          if (!cancelled) setStatus('denied');
          return;
        }
        const { roles } = await getUserRoles(userId);
        const allowed = (roles || []).some((role) =>
          STOCK_RESERVATION_ALLOWED_ROLES.includes(role)
        );
        if (!cancelled) setStatus(allowed ? 'allowed' : 'denied');
      } catch (e) {
        console.error('Failed to check stock reservation access role', e);
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16" data-testid="stock-reservation-role-loading">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <Card className="w-full max-w-md p-6 text-center" data-testid="stock-reservation-access-denied">
        <h2 className="mb-2 text-lg font-semibold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">
          You need the Production Manager, Stock Manager, or System Manager role to view this section.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
};

const StockReservationContent: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [reservations, setReservations] = useState<StockReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBranchId || activeBranchId === 'all') {
      setReservations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const rows = await stockReservationService.listReservations(activeBranchId);
        if (cancelled) return;
        setReservations(rows);
      } catch (err) {
        if (!cancelled) {
          setReservations([]);
          setError('Unable to load stock reservation data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  return (
    <Page>
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Stock Reservations</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Monitor active stock reservations and inventory holds.
        </p>
      </div>

      {!activeBranchId || activeBranchId === 'all' ? (
        <Section>
          <Card className="p-10 text-center text-sm text-text-tertiary">
            Select a branch to view its reservations.
          </Card>
        </Section>
      ) : loading ? (
        <Section>
          <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        </Section>
      ) : error ? (
        <Section>
          <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
        </Section>
      ) : reservations.length === 0 ? (
        <Section>
          <Card className="p-8 text-center text-sm text-text-tertiary">
            No active stock reservations for this branch right now.
          </Card>
        </Section>
      ) : (
        <Section>
          {(() => {
            const reservationColumns: DataTableColumn<StockReservationRow>[] = [
              {
                key: 'component_item',
                header: 'Item',
                render: (row) => <span className="font-medium text-foreground">{row.component_item}</span>,
              },
              {
                key: 'qty',
                header: 'Qty',
                align: 'right',
                render: (row) => <span className="text-muted-foreground">{formatQty(row.qty)}</span>,
              },
              {
                key: 'warehouse',
                header: 'Warehouse',
                render: (row) => <span className="text-muted-foreground">{row.warehouse}</span>,
              },
              {
                key: 'order_ref',
                header: 'Order Ref',
                render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.order_ref}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => (
                  <Badge size="tag" variant={getStatusBadgeVariant(row.status)}>
                    {row.status}
                  </Badge>
                ),
              },
              {
                key: 'expires_at',
                header: 'Expires',
                render: (row) => <span className="text-muted-foreground">{formatDateTime(row.expires_at)}</span>,
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <DeskLink doctype="URY Stock Reservation" name={row.name} iconOnly />
                  </div>
                ),
              },
            ];
            return <DataTable columns={reservationColumns} rows={reservations} emptyMessage="No reservations found." />;
          })()}
        </Section>
      )}
    </Page>
  );
};

export const StockReservationPage: React.FC = () => (
  <StockReservationRoleGate>
    <StockReservationContent />
  </StockReservationRoleGate>
);

export default StockReservationPage;
