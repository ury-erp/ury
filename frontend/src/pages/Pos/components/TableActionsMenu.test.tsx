import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableActionsMenu from './TableActionsMenu';
import type { Table } from '../lib/table-api';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../lib/table-utils', () => ({
  isMergedTable: (table: Table) => table.merged_with && table.merged_with.length > 0,
}));

const mockTable = (overrides?: Partial<Table>): Table => ({
  name: 'T1',
  restaurant_room: 'Main Hall',
  table_shape: 'Rectangle' as const,
  no_of_seats: 4,
  occupied: 0,
  ...overrides,
});

describe('TableActionsMenu', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the menu button', () => {
    render(
      <TableActionsMenu
        table={mockTable()}
        isOpen={false}
        onOpenChange={() => {}}
      />
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows merge option for available table', async () => {
    const onMerge = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable({ occupied: 0 })}
        isOpen={true}
        onOpenChange={() => {}}
        onMerge={onMerge}
      />
    );
    expect(screen.getByText('tables.merge_tables')).toBeInTheDocument();
  });

  it('shows merge option for occupied table', async () => {
    const onMerge = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable({ occupied: 1 })}
        isOpen={true}
        onOpenChange={() => {}}
        onMerge={onMerge}
      />
    );
    expect(screen.getByText('tables.merge_tables')).toBeInTheDocument();
  });

  it('shows transfer table option for occupied table', () => {
    const onTransferTable = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable({ occupied: 1 })}
        isOpen={true}
        onOpenChange={() => {}}
        onTransferTable={onTransferTable}
      />
    );
    expect(screen.getByText('tables.transfer_table')).toBeInTheDocument();
  });

  it('calls onMerge when merge button is clicked', async () => {
    const onMerge = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable({ occupied: 0 })}
        isOpen={true}
        onOpenChange={() => {}}
        onMerge={onMerge}
      />
    );
    await userEvent.click(screen.getByText('tables.merge_tables'));
    expect(onMerge).toHaveBeenCalled();
  });

  it('calls onOpenChange when menu button is clicked', async () => {
    const onOpenChange = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable()}
        isOpen={false}
        onOpenChange={onOpenChange}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('hides menu when open prop is false', () => {
    const { container } = render(
      <TableActionsMenu
        table={mockTable()}
        isOpen={false}
        onOpenChange={() => {}}
      />
    );
    expect(container.textContent).not.toContain('tables.merge_tables');
  });

  it('shows transfer captain option when enabled', () => {
    const onTransferCaptain = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable({ occupied: 1 })}
        isOpen={true}
        onOpenChange={() => {}}
        showCaptainTransfer={true}
        onTransferCaptain={onTransferCaptain}
      />
    );
    expect(screen.getByText('tables.transfer_captain')).toBeInTheDocument();
  });

  it('does not render when no available actions', () => {
    const { container } = render(
      <TableActionsMenu
        table={mockTable({ occupied: 1 })}
        isOpen={false}
        onOpenChange={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('closes menu after action is clicked', async () => {
    const onOpenChange = vi.fn();
    const onMerge = vi.fn();
    
    const { rerender } = render(
      <TableActionsMenu
        table={mockTable({ occupied: 0 })}
        isOpen={true}
        onOpenChange={onOpenChange}
        onMerge={onMerge}
      />
    );

    await userEvent.click(screen.getByText('tables.merge_tables'));
    
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
