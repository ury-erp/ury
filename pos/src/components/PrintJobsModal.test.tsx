import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrintJobsModal from './PrintJobsModal';

describe('PrintJobsModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a FAILED job row from mocked data', async () => {
    const job = {
      name: 'URYPJ-0001',
      print_job_id: 'pj-failed-1',
      job_type: 'BILL',
      status: 'FAILED',
      invoice: 'INV-0001',
      printer: 'PRN-1',
      printer_name: 'Counter Printer',
      job_owner: 'cashier@example.com',
      table: 'T-1',
      failure_reason: 'Printer unreachable',
      created_at: '2026-10-16 10:00:00',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [job] }),
      })
    );

    render(<PrintJobsModal open onOpenChange={() => {}} invoiceId="INV-0001" />);

    expect(await screen.findByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('pj-failed-1')).toBeInTheDocument();
    expect(screen.getByText('Counter Printer')).toBeInTheDocument();
  });
});
