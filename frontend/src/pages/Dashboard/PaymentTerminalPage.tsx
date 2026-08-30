import React, { useEffect, useState } from 'react';
import { Card, Spinner } from '@ury/ui';
import { call } from '@ury/core';
import {
  paymentTerminalService,
  PaymentTerminal,
  PaymentTerminalTransaction,
} from '../../services/paymentTerminal';

const PROVIDERS = ['Simulated', 'Ingenico', 'PAX', 'Verifone', 'Other'];

const formatDateTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleString();
};

const formatCurrency = (value?: number) => {
  if (value === undefined) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(value);
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Idle':
      return 'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800';
    case 'Busy':
      return 'inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800';
    case 'Offline':
      return 'inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800';
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground';
  }
};

const getTransactionStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Success':
      return 'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800';
    case 'Failed':
      return 'inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800';
    case 'Pending':
      return 'inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800';
    default:
      return 'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground';
  }
};

const PaymentTerminalContent: React.FC = () => {
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [transactions, setTransactions] = useState<PaymentTerminalTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [formData, setFormData] = useState({
    terminal_id: '',
    device: '',
    provider: 'Simulated',
  });

  const loadTerminals = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentTerminalService.listTerminals();
      setTerminals(data);
    } catch (err) {
      setTerminals([]);
      setError('Unable to load payment terminals.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setTransactionLoading(true);
    try {
      const data = await paymentTerminalService.listTerminalTransactions();
      setTransactions(data);
    } catch (err) {
      setTransactions([]);
      console.error(err);
    } finally {
      setTransactionLoading(false);
    }
  };

  useEffect(() => {
    loadTerminals();
    loadTransactions();
  }, []);

  const handleCreateTerminal = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.terminal_id) {
      setCreateError('Terminal ID is required');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      await paymentTerminalService.createTerminal({
        terminal_id: formData.terminal_id,
        device: formData.device || undefined,
        provider: formData.provider,
      });

      setFormData({
        terminal_id: '',
        device: '',
        provider: 'Simulated',
      });

      await loadTerminals();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create terminal');
      console.error(err);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="-mx-6 -mt-6 border-b border-border px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold text-foreground">Payment Terminals</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Register and manage payment terminal devices. Monitor terminal status and view transaction history.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Register New Terminal</h2>
        <Card className="p-6">
          <form onSubmit={handleCreateTerminal} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col">
                <label className="text-sm font-medium text-muted-foreground mb-1">
                  Terminal ID <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formData.terminal_id}
                  onChange={(e) =>
                    setFormData({ ...formData, terminal_id: e.target.value })
                  }
                  placeholder="e.g., TERM-001"
                  className="rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder-gray-500 focus:border-primary focus:outline-none"
                  disabled={createLoading}
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm font-medium text-muted-foreground mb-1">
                  Device
                </label>
                <input
                  type="text"
                  value={formData.device}
                  onChange={(e) =>
                    setFormData({ ...formData, device: e.target.value })
                  }
                  placeholder="e.g., Ingenico iCT2X0"
                  className="rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder-gray-500 focus:border-primary focus:outline-none"
                  disabled={createLoading}
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm font-medium text-muted-foreground mb-1">
                  Provider
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) =>
                    setFormData({ ...formData, provider: e.target.value })
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  disabled={createLoading}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createLoading ? 'Creating...' : 'Register Terminal'}
                </button>
              </div>
            </div>

            {createError && (
              <div className="text-sm text-destructive bg-destructive-tint rounded-md p-3">
                {createError}
              </div>
            )}
          </form>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Registered Terminals</h2>
        {loading ? (
          <div className="flex items-center justify-center rounded-lg border border-border bg-white py-16">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        ) : error ? (
          <Card className="border-destructive bg-destructive-tint p-6 text-sm text-destructive">
            {error}
          </Card>
        ) : terminals.length === 0 ? (
          <Card className="p-8 text-center text-sm text-text-tertiary">
            No payment terminals registered yet. Create one using the form above.
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs font-semibold text-text-tertiary">
                  <tr>
                    <th className="px-4 py-3">Terminal ID</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {terminals.map((terminal) => (
                    <tr key={terminal.name}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {terminal.terminal_id}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {terminal.device || '-'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {terminal.provider || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={getStatusBadgeClass(terminal.status || 'Idle')}>
                          {terminal.status || 'Idle'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateTime(terminal.last_seen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Transaction Log</h2>
        {transactionLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-border bg-white py-16">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <Card className="p-8 text-center text-sm text-text-tertiary">
            No transactions recorded yet.
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs font-semibold text-text-tertiary">
                  <tr>
                    <th className="px-4 py-3">Terminal</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((tx) => (
                    <tr key={tx.name}>
                      <td className="px-4 py-3 font-medium text-foreground font-mono text-xs">
                        {tx.terminal || '-'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {tx.invoice || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={getTransactionStatusBadgeClass(tx.status || 'Pending')}>
                          {tx.status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateTime(tx.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const PaymentTerminalPage: React.FC = () => (
  <PaymentTerminalContent />
);

export default PaymentTerminalPage;
