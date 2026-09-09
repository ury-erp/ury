import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Orders from './Orders';

vi.mock('../store/root-store', () => ({
  useRootStore: () => ({
    orders: [],
    orderLoading: false,
    error: null,
    selectedStatus: 'All',
    pagination: {
      currentPage: 1,
      pageSize: 10,
      totalPages: 1,
      total: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    },
    selectedOrder: null,
    selectedOrderItems: [],
    selectedOrderTaxes: [],
    selectedOrderLoading: false,
    selectedOrderError: null,
    fetchOrders: vi.fn(),
    setSelectedStatus: vi.fn(),
    goToNextPage: vi.fn(),
    goToPreviousPage: vi.fn(),
    selectOrder: vi.fn(),
    clearSelectedOrder: vi.fn(),
    orderSearchQuery: '',
  }),
}));

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => ({
    posProfile: null,
    setSelectedTable: vi.fn(),
    setSelectedOrderType: vi.fn(),
  }),
}));

describe('Orders', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders without crashing', async () => {
    const { container } = render(
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders page structure', async () => {
    const { container } = render(
      <MemoryRouter>
        <Orders />
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
        <Orders />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('renders flex layout', async () => {
    const { container } = render(
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    );
    await waitFor(() => {
      const flexDiv = container.querySelector('.flex');
      expect(flexDiv).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders with overflow hidden', async () => {
    const { container } = render(
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    );
    await waitFor(() => {
      const mainDiv = container.querySelector('.overflow-hidden');
      expect(mainDiv).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders multiple sections', async () => {
    const { container } = render(
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    );
    await waitFor(() => {
      const divs = container.querySelectorAll('div');
      expect(divs.length).toBeGreaterThanOrEqual(3);
    }, { timeout: 3000 });
  });

  it('renders main content area', async () => {
    const { container } = render(
      <MemoryRouter>
        <Orders />
      </MemoryRouter>
    );
    await waitFor(() => {
      const contentArea = container.querySelector('main') || container.querySelector('.flex-1');
      expect(contentArea || container.querySelector('div')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
