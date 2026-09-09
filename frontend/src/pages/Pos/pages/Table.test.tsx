import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TableView from './Table';

vi.mock('../store/root-store', () => ({
  useRootStore: () => ({
    user: {
      name: 'test-user',
      email: 'test@example.com',
    },
  }),
}));

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => ({
    posProfile: {
      branch: 'test-branch',
      name: 'test-profile',
    },
    setSelectedTable: vi.fn(),
    setSelectedOrderType: vi.fn(),
  }),
}));

vi.mock('../lib/table-api', () => ({
  getRooms: vi.fn().mockResolvedValue([]),
  getTables: vi.fn().mockResolvedValue([]),
  getTableCount: vi.fn().mockResolvedValue(0),
  getVacantTablesForBranch: vi.fn().mockResolvedValue([]),
  mergeTablesBatch: vi.fn(),
  unmergeTables: vi.fn(),
}));

vi.mock('../lib/order-api', () => ({
  captainTransfer: vi.fn(),
  getTableOrder: vi.fn(),
  tableTransfer: vi.fn(),
}));

vi.mock('../lib/print', () => ({
  printOrder: vi.fn(),
}));

vi.mock('../lib/invoice-api', () => ({
  resolvePrintFormat: vi.fn(),
}));

vi.mock('@ury/core', () => ({
  canCaptainTransfer: vi.fn().mockReturnValue(false),
}));

describe('TableView', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders without crashing', async () => {
    const { container } = render(
      <MemoryRouter>
        <TableView />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders page structure', async () => {
    const { container } = render(
      <MemoryRouter>
        <TableView />
      </MemoryRouter>
    );
    await waitFor(() => {
      const divs = container.querySelectorAll('div');
      expect(divs.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('renders as a React component', async () => {
    const { container } = render(
      <MemoryRouter>
        <TableView />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders flex container', async () => {
    const { container } = render(
      <MemoryRouter>
        <TableView />
      </MemoryRouter>
    );
    await waitFor(() => {
      const flexDiv = container.querySelector('.flex');
      expect(flexDiv).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders with h-full layout', async () => {
    const { container } = render(
      <MemoryRouter>
        <TableView />
      </MemoryRouter>
    );
    await waitFor(() => {
      const mainDiv = container.querySelector('.h-full');
      expect(mainDiv).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders multiple child components', async () => {
    const { container } = render(
      <MemoryRouter>
        <TableView />
      </MemoryRouter>
    );
    await waitFor(() => {
      const divs = container.querySelectorAll('div');
      expect(divs.length).toBeGreaterThanOrEqual(3);
    }, { timeout: 3000 });
  });
});
