import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableTransferDialog from './TableTransferDialog';
import type { Table } from '../lib/table-api';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('./TableShapeIcon', () => ({
  TableShapeIcon: () => <div>Icon</div>,
}));

const mockTable = (name: string = 'T1'): Table => ({
  name,
  restaurant_room: 'Main Hall',
  table_shape: 'Rectangle' as const,
  no_of_seats: 4,
  occupied: 0,
});

describe('TableTransferDialog', () => {
  beforeEach(() => {
    cleanup();
  });

  it('does not render when open is false', () => {
    const { container } = render(
      <TableTransferDialog
        open={false}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={[]}
        onConfirm={() => Promise.resolve()}
      />
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('renders the dialog when open is true', () => {
    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable()}
        destinationTables={[]}
        onConfirm={() => Promise.resolve()}
      />
    );
    expect(screen.getByText('tables.transfer_table')).toBeInTheDocument();
  });

  it('displays the source table name', () => {
    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={[]}
        onConfirm={() => Promise.resolve()}
      />
    );
    expect(screen.getByDisplayValue('T1')).toBeInTheDocument();
  });

  it('displays available destination tables grouped by room', async () => {
    const tables = [
      mockTable('T2'),
      { ...mockTable('T3'), restaurant_room: 'Bar' },
      { ...mockTable('T4'), restaurant_room: 'Main Hall' },
    ];

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={tables}
        onConfirm={() => Promise.resolve()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Main Hall')).toBeInTheDocument();
      expect(screen.getByText('Bar')).toBeInTheDocument();
    });
  });

  it('allows selecting a destination table', async () => {
    const tables = [mockTable('T2')];

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={tables}
        onConfirm={() => Promise.resolve()}
      />
    );

    await userEvent.click(screen.getByText('T2'));
    
    expect(screen.getByText('T2')).toBeInTheDocument();
  });

  it('filters tables by search text', async () => {
    const tables = [
      mockTable('T2'),
      { ...mockTable('T3'), restaurant_room: 'Bar' },
    ];

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={tables}
        onConfirm={() => Promise.resolve()}
      />
    );

    const searchInput = screen.getByPlaceholderText('tables.search_transfer_placeholder');
    await userEvent.type(searchInput, 'Bar');

    await waitFor(() => {
      expect(screen.getByText('T3')).toBeInTheDocument();
    });
  });

  it('calls onConfirm when transfer is confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const tables = [mockTable('T2')];

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={tables}
        onConfirm={onConfirm}
      />
    );

    await userEvent.click(screen.getByText('T2'));
    await userEvent.click(screen.getByText('tables.transfer_confirm'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('T2');
    });
  });

  it('shows loading state when loading prop is true', () => {
    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable()}
        destinationTables={[]}
        loading={true}
        onConfirm={() => Promise.resolve()}
      />
    );
    // When loading is true, Spinner component is rendered
    expect(screen.queryByRole('button', { name: /tables.transfer_confirm/i })).toBeDisabled();
  });

  it('shows error message on confirmation failure', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Transfer failed'));
    const tables = [mockTable('T2')];

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={() => {}}
        sourceTable={mockTable('T1')}
        destinationTables={tables}
        onConfirm={onConfirm}
      />
    );

    await userEvent.click(screen.getByText('T2'));
    await userEvent.click(screen.getByText('tables.transfer_confirm'));

    await waitFor(() => {
      expect(screen.getByText('Transfer failed')).toBeInTheDocument();
    });
  });

  it('calls onOpenChange with false when cancel is clicked', async () => {
    const onOpenChange = vi.fn();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable()}
        destinationTables={[]}
        onConfirm={() => Promise.resolve()}
      />
    );

    await userEvent.click(screen.getByText('common.cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
