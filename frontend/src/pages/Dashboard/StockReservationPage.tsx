import React, { useEffect, useState } from 'react';
import { Card, Spinner } from '@ury/ui';
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
      return 'inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800';
    case 'Fulfilled':
      return 'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800';
    case 'Released':
      return 'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800';
    case 'Expired':
      return 'inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800';
    case 'Cancelled':
      return 'inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800';
    default:
      return 'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800';
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
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="text-gray-600">
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
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
        <div className="mb-4 space-y-3">
          <label className="flex flex-col text-sm font-medium text-gray-700">
            Reason (optional)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for this action..."
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
              rows={3}
              disabled={loading}
            />
          </label>
          {error && (
            <div className="text-sm text-red-700">{error}</div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : action}
          </button>
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
      <div className="-mx-6 -mt-6 border-b border-gray-200 px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-gray-900">Stock Reservations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor active stock reservations and manage capacity holds. Managers can release or cancel
          Reserved status reservations to restore inventory availability.
        </p>
      </div>

      {!activeBranchId || activeBranchId === 'all' ? (
        <Card className="p-10 text-center text-sm text-gray-500">
          Select a branch to view its reservations.
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>
      ) : reservations.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No stock reservations found for this branch.
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
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
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.component_item}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatQty(row.qty)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.warehouse}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                      {row.order_ref}
                    </td>
                    <td className="px-4 py-3">
                      <span className={getStatusBadgeClass(row.status)}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTime(row.expires_at)}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'Reserved' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleActionClick(row.name, 'release')}
                            className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                          >
                            Release
                          </button>
                          <button
                            onClick={() => handleActionClick(row.name, 'cancel')}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                          >
                            Cancel
                          </button>
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
