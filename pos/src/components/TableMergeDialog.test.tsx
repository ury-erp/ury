import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import TableMergeDialog from './TableMergeDialog';
import type { Table } from '../lib/table-api';

vi.mock('./TableShapeIcon', () => ({
  TableShapeIcon: ({ shape }: { shape: string }) => <div>{shape}</div>,
}));

vi.mock('../i18n', () => ({
  t: (key: string, args?: Record<string, string | number>) => {
    if (key === 'tables.merge_with' && args?.table) return `Merge with ${args.table}`;
    if (key === 'tables.merge_selected_count' && args?.count) return `Merge ${args.count} tables`;
    return key;
  },
}));

vi.mock('@ury/ui', () => ({
  MultiSelectTableDialog: ({
    open,
    onOpenChange,
    sourceName,
    options,
    onConfirm,
    labels,
    renderIcon,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sourceName: string;
    options: Array<{ name: string; occupied?: number; seatsLabel?: string }>;
    onConfirm: (names: string[]) => Promise<void>;
    labels: {
      title: string;
      description: string;
      empty: string;
      cancel: string;
      confirm: string;
      selectedCount: (n: number) => string;
    };
    renderIcon?: (name: string) => React.ReactNode;
  }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    useEffect(() => {
      if (open) setSelected(new Set());
    }, [open, sourceName]);

    if (!open) return null;

    const candidates = options.filter(
      (table) => table.occupied !== 1 && table.name !== sourceName
    );

    const toggle = (name: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    };

    const handleConfirm = async () => {
      if (selected.size === 0) return;
      await onConfirm(Array.from(selected));
      onOpenChange(false);
    };

    return (
      <div>
        <h2>{labels.title}</h2>
        <p>{labels.description}</p>
        {candidates.length === 0 ? (
          <p>{labels.empty}</p>
        ) : (
          candidates.map((table) => (
            <button key={table.name} type="button" onClick={() => toggle(table.name)}>
              {renderIcon?.(table.name)}
              {table.name}
            </button>
          ))
        )}
        <button type="button" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </button>
        <button type="button" disabled={selected.size === 0} onClick={() => void handleConfirm()}>
          {labels.confirm}
        </button>
        {selected.size > 0 && <span>{labels.selectedCount(selected.size)}</span>}
      </div>
    );
  },
}));

const mockTable1: Table = {
  name: 'Table-1',
  occupied: 0,
  table_shape: 'Rectangle',
  no_of_seats: 4,
};

const mockTable2: Table = {
  name: 'Table-2',
  occupied: 0,
  table_shape: 'Circle',
  no_of_seats: 2,
};

const mockOccupiedTable: Table = {
  name: 'Table-3',
  occupied: 1,
  table_shape: 'Square',
  no_of_seats: 6,
};

describe('TableMergeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when sourceTable is null', () => {
    const { container } = render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={null}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when open and sourceTable provided', () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={vi.fn()}
      />
    );
    
    expect(screen.getByText('Merge with Table-1')).toBeTruthy();
  });

  it('displays merge candidates (unoccupied tables except source)', () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2, mockOccupiedTable]}
        onConfirm={vi.fn()}
      />
    );
    
    expect(screen.getByText('Table-2')).toBeTruthy();
    expect(screen.queryByText('Table-3')).not.toBeInTheDocument();
  });

  it('does not show occupied tables as merge candidates', () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockOccupiedTable]}
        onConfirm={vi.fn()}
      />
    );
    
    expect(screen.queryByText('Table-3')).not.toBeInTheDocument();
  });

  it('allows selecting a table', async () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={vi.fn()}
      />
    );
    
    const table2Button = screen.getByText('Table-2').closest('button');
    await userEvent.click(table2Button!);
    expect(table2Button).toBeTruthy();
  });

  it('disables merge button when no tables selected', () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={vi.fn()}
      />
    );
    
    const buttons = screen.getAllByRole('button').filter(b => b.textContent?.includes('tables.merge'));
    const mergeButton = buttons[buttons.length - 1];
    expect(mergeButton.hasAttribute('disabled')).toBe(true);
  });

  it('enables merge button when tables are selected', async () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={vi.fn()}
      />
    );
    
    const table2Button = screen.getByText('Table-2').closest('button');
    await userEvent.click(table2Button!);
    
    const mergeButtons = screen.getAllByRole('button').filter(b => b.textContent?.includes('merge'));
    const mergeButton = mergeButtons.find(b => b.textContent?.includes('tables.merge'));
    await waitFor(() => {
      expect(mergeButton?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('calls onConfirm with selected tables', async () => {
    const onConfirm = vi.fn().mockResolvedValueOnce(undefined);
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={onConfirm}
      />
    );
    
    const table2Button = screen.getByText('Table-2').closest('button');
    await userEvent.click(table2Button!);
    
    const mergeButtons = screen.getAllByRole('button');
    const mergeButton = mergeButtons.find(b => b.textContent?.includes('merge'));
    await userEvent.click(mergeButton!);
    
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(['Table-2']);
    });
  });

  it('calls onOpenChange when dialog closes', async () => {
    const onOpenChange = vi.fn();
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockTable2]}
        onConfirm={vi.fn()}
      />
    );
    
    const cancelButton = screen.getByText('common.cancel');
    await userEvent.click(cancelButton);
    
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows no candidates message when all tables are occupied', () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTable1}
        availableTables={[mockTable1, mockOccupiedTable]}
        onConfirm={vi.fn()}
      />
    );
    
    expect(screen.getByText('tables.no_tables_to_merge')).toBeTruthy();
  });
});
