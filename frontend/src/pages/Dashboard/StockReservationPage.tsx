import React, { useEffect, useState } from 'react';
import { Button, Card, Spinner, Textarea } from '@ury/ui';
import { getLoggedUser, getUserRoles } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
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

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Reserved':
      return 'inline-flex items-center rounded-full bg-primary-tint px-2.5 py-0.5 text-xs font-medium text-primary';
    case 'Fulfilled':
      return 'inline-flex items-center rounded-full bg-success-tint px-2.5 py-0.5 text-xs font-medium text-success';
    case 'Released':
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground';
    case 'Expired':
      return 'inline-flex items-center rounded-full bg-warning-tint px-2.5 py-0.5 text-xs font-medium text-yellow-800';
    case 'Cancelled':
      return 'inline-flex items-center rounded-full bg-destructive-tint px-2.5 py-0.5 text-xs font-medium text-destructive';
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground';
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

  const handleActionClick = (rowId: string, action: string) => {
    const title = action === 'release' ? 'Release Reservation' : 'Cancel Reservation';
    setActionModal({
      isOpen: true,
      title,
      action: action === 'release' ? 'Release' : 'Cancel',
      rowId,
    });
  };

  const handleConfirmAction = async (reason: string) => {
    try {
      if (actionModal.action === 'Release') {
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
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Stock Reservations</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Monitor active stock reservations and manage capacity holds. Managers can release or cancel
          Reserved status reservations to restore inventory availability.
        </p>
      </div>

      {!activeBranchId || activeBranchId === 'all' ? (
        <Card className="p-10 text-center text-sm text-text-tertiary">
          Select a branch to view its reservations.
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
      ) : reservations.length === 0 ? (
        <Card className="p-8 text-center text-sm text-text-tertiary">
          No active stock reservations for this branch right now.
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted text-xs font-semibold text-text-tertiary">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reservations.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.component_item}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatQty(row.qty)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.warehouse}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {row.order_ref}
                    </td>
                    <td className="px-4 py-3">
                      <span className={getStatusBadgeClass(row.status)}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(row.expires_at)}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'Reserved' && (
                        <div className="flex gap-2">
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
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ActionModal
        isOpen={actionModal.isOpen}
        title={actionModal.title}
        action={actionModal.action}
        onConfirm={handleConfirmAction}
        onCancel={() => setActionModal({ ...actionModal, isOpen: false })}
      />
    </div>
  );
};

export const StockReservationPage: React.FC = () => (
  <StockReservationRoleGate>
    <StockReservationContent />
  </StockReservationRoleGate>
);

export default StockReservationPage;
