import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillMergeDialog from './BillMergeDialog';

const getLinkedMergeSecondariesMock = vi.fn();
const getMergeBillCandidatesMock = vi.fn();
const mergeBillsMock = vi.fn();

vi.mock('../lib/invoice-api', () => ({
  getLinkedMergeSecondaries: (...args: any[]) => getLinkedMergeSecondariesMock(...args),
  getMergeBillCandidates: (...args: any[]) => getMergeBillCandidatesMock(...args),
  mergeBills: (...args: any[]) => mergeBillsMock(...args),
}));

vi.mock('../i18n', () => ({
  t: (key: string, params?: any) => {
    const translations: Record<string, string> = {
      'bill_merge.merge_bill': 'Merge Bill',
      'bill_merge.select_secondary': 'Select a bill to merge',
      'bill_merge.no_candidates': 'No bills available to merge',
      'bill_merge.load_more': 'Load More',
      'bill_merge.merge_success': 'Bill merged successfully',
      'bill_merge.merge_failed': 'Failed to merge bill',
      'bill_merge.merge_confirm': 'Merge',
      'common.loading': 'Loading...',
      'common.cancel': 'Cancel',
      'header.search_placeholder_orders': 'Search orders...',
    };
    return translations[key] || key;
  },
}));

vi.mock('@ury/core', () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock('@ury/ui', () => ({
  Dialog: ({ open, onOpenChange, children }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: any) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  Button: ({ onClick, disabled, children, variant }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid={`button-${variant || 'primary'}`}>{children}</button>
  ),
  Spinner: ({ message }: any) => <div data-testid="spinner">{message}</div>,
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  showToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/table-utils', () => ({
  formatMergedTableLabel: (table: string) => table,
}));

describe('BillMergeDialog', () => {
  beforeEach(() => {
    cleanup();
    getLinkedMergeSecondariesMock.mockReset();
    getMergeBillCandidatesMock.mockReset();
    mergeBillsMock.mockReset();
  });

  it('does not render when open is false', () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={false}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByTestId('dialog-title')).not.toBeInTheDocument();
  });

  it('renders dialog when open is true', async () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Merge Bill')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('displays no candidates message when list is empty', async () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No bills available to merge')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('disables merge button when no candidate is selected', () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    const mergeButton = screen.getByText('Merge');
    expect(mergeButton).toHaveAttribute('disabled');
  });
});
