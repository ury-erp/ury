import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, DataTable, Page, Section, Spinner, Textarea, type DataTableColumn } from '@ury/ui';
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

interface ActionModalProps {
  isOpen: boolean;
  title: string;
  action: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  title,
  action,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // `fulfil_reservation` has no `reason` parameter, so offering the field for
  // that action would silently discard whatever the user typed.
  const showReason = action !== 'Fulfil';

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason);
      setReason('');
      onCancel();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
        <div className="mb-4 space-y-3">
          {showReason ? (
            <label className="flex flex-col text-sm font-medium text-muted-foreground">
              Reason (optional)
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for this action..."
                className="mt-1"
                disabled={loading}
              />
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mark this reservation group as fulfilled. Its held capacity stops being
              counted as available and the transition is written to the reservation's
              audit log. This cannot be undone from here.
            </p>
          )}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <Button
            onClick={onCancel}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            variant="default"
            size="sm"
          >
            {loading ? 'Processing...' : action}
          </Button>
        </div>
      </Card>
    </div>
  );
};

const StockReservationContent: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [reservations, setReservations] = useState<StockReservationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    title: string;
    action: string;
    rowId: string;
  }>({ isOpen: false, title: '', action: '', rowId: '' });

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

  const handleActionClick = (rowId: string, action: 'fulfil' | 'release' | 'cancel') => {
    const config = {
      fulfil: { title: 'Fulfil Reservation', action: 'Fulfil' },
      release: { title: 'Release Reservation', action: 'Release' },
      cancel: { title: 'Cancel Reservation', action: 'Cancel' },
    }[action];
    setActionModal({
      isOpen: true,
      title: config.title,
      action: config.action,
      rowId,
    });
  };

  const handleConfirmAction = async (reason: string) => {
    try {
      if (actionModal.action === 'Fulfil') {
        // `fulfil_reservation` takes no reason -- the backend records the
        // actor and event in the reservation's audit log itself.
        await stockReservationService.fulfilReservation(actionModal.rowId);
      } else if (actionModal.action === 'Release') {
        await stockReservationService.releaseReservation(actionModal.rowId, reason || undefined);
      } else {
        await stockReservationService.cancelReservation(actionModal.rowId, reason || undefined);
      }
      const rows = await stockReservationService.listReservations(activeBranchId!);
      setReservations(rows);
    } catch (err: any) {
      throw new Error(err.message || 'Action failed');
    }
  };

  return (
    <Page>
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Stock Reservations</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Monitor active stock reservations and manage capacity holds. Managers can fulfil, release,
          or cancel Reserved status reservations; releasing and cancelling restore inventory
          availability, fulfilling settles the hold.
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
                    {/* Open in desk points at the editable URY Stock Reservation
                        document, since this screen only performs status
                        transitions and never edits a reservation's fields.
                        Shown for every status -- a released/expired row is
                        exactly the kind you want to inspect in the desk. */}
                    <DeskLink doctype="URY Stock Reservation" name={row.name} iconOnly />
                    {row.status === 'Reserved' && (
                      <>
                        <Button
                          onClick={() => handleActionClick(row.name, 'fulfil')}
                          variant="secondary"
                          size="xs"
                        >
                          Fulfil
                        </Button>
                        <Button
                          onClick={() => handleActionClick(row.name, 'release')}
                          variant="secondary"
                          size="xs"
                        >
                          Release
                        </Button>
                        <Button
                          onClick={() => handleActionClick(row.name, 'cancel')}
                          variant="secondary"
                          size="xs"
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ];
            return <DataTable columns={reservationColumns} rows={reservations} emptyMessage="No reservations found." />;
          })()}
        </Section>
      )}

      <ActionModal
        isOpen={actionModal.isOpen}
        title={actionModal.title}
        action={actionModal.action}
        onConfirm={handleConfirmAction}
        onCancel={() => setActionModal({ ...actionModal, isOpen: false })}
      />
    </Page>
  );
};

export const StockReservationPage: React.FC = () => (
  <StockReservationRoleGate>
    <StockReservationContent />
  </StockReservationRoleGate>
);

export default StockReservationPage;
