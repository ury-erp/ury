import { call } from '@ury/core';

export interface PaymentTerminal {
  name: string;
  terminal_id?: string;
  device?: string;
  provider?: string;
  status?: string;
  last_transaction_id?: string;
  last_seen?: string;
}

export interface PaymentTerminalTransaction {
  name: string;
  terminal?: string;
  invoice?: string;
  transaction_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: string;
}

const normalizeTerminal = (row: any): PaymentTerminal => ({
  name: String(row.name || ''),
  terminal_id: row.terminal_id,
  device: row.device,
  provider: row.provider || 'Simulated',
  status: row.status || 'Idle',
  last_transaction_id: row.last_transaction_id,
  last_seen: row.last_seen,
});

const normalizeTransaction = (row: any): PaymentTerminalTransaction => ({
  name: String(row.name || ''),
  terminal: row.terminal,
  invoice: row.invoice,
  transaction_id: row.transaction_id,
  amount: row.amount !== undefined ? Number(row.amount) : undefined,
  currency: row.currency,
  status: row.status || 'Pending',
  created_at: row.created_at,
});

const normalizeList = <T,>(payload: unknown): T[] => {
  const message = (payload as any)?.message ?? payload;
  return Array.isArray(message) ? (message as T[]) : [];
};

export const paymentTerminalService = {
  /**
   * Lists all  records.
   */
  async listTerminals(): Promise<PaymentTerminal[]> {
    const res = await call<any>('frappe.client.get_list', {
      doctype: 'URY Payment Terminal',
      fields: ['name', 'terminal_id', 'device', 'provider', 'status', 'last_transaction_id', 'last_seen'],
      limit_page_length: 0,
    });
    return normalizeList<any>(res).map(normalizeTerminal);
  },

  /**
   * Lists  records, optionally filtered by terminal.
   */
  async listTerminalTransactions(terminalName?: string): Promise<PaymentTerminalTransaction[]> {
    const filters = terminalName ? { terminal: terminalName } : {};
    const res = await call<any>('frappe.client.get_list', {
      doctype: 'URY Payment Terminal Transaction',
      filters,
      fields: ['name', 'terminal', 'invoice', 'transaction_id', 'amount', 'currency', 'status', 'created_at'],
      order_by: 'created_at desc',
      limit_page_length: 100,
    });
    return normalizeList<any>(res).map(normalizeTransaction);
  },

  /**
   * Creates a new  record.
   */
  async createTerminal(data: Partial<PaymentTerminal>): Promise<PaymentTerminal> {
    const res = await call<any>('frappe.client.insert', {
      doc: {
        doctype: 'URY Payment Terminal',
        terminal_id: data.terminal_id,
        device: data.device,
        provider: data.provider || 'Simulated',
        status: data.status || 'Idle',
      },
    });
    return normalizeTerminal((res as any)?.message ?? res);
  },
};
