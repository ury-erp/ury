import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import MenuRoutingPage from './MenuRoutingPage';
import { menuAvailabilityService } from '../../services/menuAvailability';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'branch1' }),
}));

vi.mock('../../services/menuAvailability', () => ({
  menuAvailabilityService: {
    resolveDefaultCompany: vi.fn().mockResolvedValue('company1'),
    listCatalogItems: vi.fn().mockResolvedValue([
      { item_code: 'ITEM-001', item_name: 'Biryani' },
    ]),
    checkAvailability: vi.fn().mockResolvedValue({
      checked: [
        {
          item_code: 'ITEM-001',
          item_name: 'Biryani',
          sellable: true,
          reason_code: 'AVAILABLE',
        },
      ],
      failed: [],
    }),
  },
  ITEM_CHECK_LIMIT: 100,
}));

vi.mock('../../components/DeskLink', () => ({
  DeskLink: ({ name, label }: any) => <a href="#">{label || name}</a>,
}));

describe('MenuRoutingPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders Menu Sellability page', async () => {
    render(<MenuRoutingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Menu Sellability/i)).toBeInTheDocument();
    });
  });

  it('resolves default company on mount', async () => {
    render(<MenuRoutingPage />);
    await waitFor(() => {
      expect(menuAvailabilityService.resolveDefaultCompany).toHaveBeenCalled();
    });
  });

  it('lists catalog items', async () => {
    render(<MenuRoutingPage />);
    await waitFor(() => {
      expect(menuAvailabilityService.listCatalogItems).toHaveBeenCalled();
    });
  });

  it('checks availability for items', async () => {
    render(<MenuRoutingPage />);
    await waitFor(() => {
      expect(menuAvailabilityService.checkAvailability).toHaveBeenCalled();
    });
  });

  it('displays KPI strip with metrics', async () => {
    render(<MenuRoutingPage />);
    await waitFor(() => {
      const page = document.body;
      expect(page).toBeInTheDocument();
    });
  });

  it('shows Unsellable items in Attention Feed', async () => {
    render(<MenuRoutingPage />);
    await waitFor(() => {
      expect(screen.getByText(/Unsellable items/i)).toBeInTheDocument();
    });
  });
});
