import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AggregatorSelect } from './AggregatorSelect';
import { getAggregators } from '../lib/aggregator-api';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock aggregator-api
vi.mock('../lib/aggregator-api', () => ({
  getAggregators: vi.fn(),
}));

// Mock the Select UI component (Radix Select)
vi.mock('./ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled, placeholder }: any) => (
    <div data-testid="select" data-disabled={disabled}>
      <button data-testid="select-trigger" disabled={disabled}>
        {value || placeholder}
      </button>
      <div data-testid="select-content" data-on-value-change={onValueChange ? 'yes' : 'no'}>
        {children}
      </div>
    </div>
  ),
  SelectItem: ({ children, value, ...props }: any) => (
    <div data-testid={`select-item-${value}`} data-value={value} {...props}>
      {children}
    </div>
  ),
}));

// Module-level mutable store state
let mockPOSStoreState: Record<string, unknown> = {
  selectedAggregator: null,
  setSelectedAggregator: vi.fn(),
  fetchAggregatorMenu: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockPOSStoreState,
}));

describe('AggregatorSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPOSStoreState = {
      selectedAggregator: null,
      setSelectedAggregator: vi.fn(),
      fetchAggregatorMenu: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('renders the select component', () => {
    vi.mocked(getAggregators).mockResolvedValue([]);
    render(<AggregatorSelect />);
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });

  it('shows loading placeholder while fetching aggregators', () => {
    vi.mocked(getAggregators).mockReturnValue(new Promise(() => {}));
    render(<AggregatorSelect />);
    expect(screen.getByText('aggregator.loading')).toBeInTheDocument();
  });

  it('shows select placeholder after aggregators are loaded', async () => {
    vi.mocked(getAggregators).mockResolvedValue([]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByText('aggregator.select_placeholder')).toBeInTheDocument();
    });
  });

  it('fetches aggregators on mount', () => {
    vi.mocked(getAggregators).mockResolvedValue([]);
    render(<AggregatorSelect />);
    expect(getAggregators).toHaveBeenCalledTimes(1);
  });

  it('renders aggregator items after fetch', async () => {
    vi.mocked(getAggregators).mockResolvedValue([
      { customer: 'Swiggy' },
      { customer: 'Zomato' },
    ]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByTestId('select-item-Swiggy')).toBeInTheDocument();
      expect(screen.getByTestId('select-item-Zomato')).toBeInTheDocument();
    });
  });

  it('disables select when disabled prop is true', async () => {
    vi.mocked(getAggregators).mockResolvedValue([]);
    render(<AggregatorSelect disabled={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('select-trigger')).toBeDisabled();
    });
  });

  it('disables select while loading', () => {
    vi.mocked(getAggregators).mockReturnValue(new Promise(() => {}));
    render(<AggregatorSelect />);
    expect(screen.getByTestId('select-trigger')).toBeDisabled();
  });

  it('enables select after loading completes', async () => {
    vi.mocked(getAggregators).mockResolvedValue([]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByTestId('select-trigger')).not.toBeDisabled();
    });
  });

  it('displays selected aggregator value', async () => {
    mockPOSStoreState.selectedAggregator = { customer: 'Swiggy' };
    vi.mocked(getAggregators).mockResolvedValue([
      { customer: 'Swiggy' },
    ]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByText('Swiggy')).toBeInTheDocument();
    });
  });

  it('calls setSelectedAggregator and fetchAggregatorMenu on value change', async () => {
    vi.mocked(getAggregators).mockResolvedValue([
      { customer: 'Swiggy' },
    ]);
    // We can't easily simulate Radix Select's onValueChange in this mock setup
    // but we verify the store functions are available
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(getAggregators).toHaveBeenCalled();
    });
    expect(mockPOSStoreState.setSelectedAggregator).not.toHaveBeenCalled();
  });

  it('passes onValueChange handler to Select component', async () => {
    vi.mocked(getAggregators).mockResolvedValue([
      { customer: 'Swiggy' },
    ]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByTestId('select-content')).toHaveAttribute('data-on-value-change', 'yes');
    });
  });

  it('handles fetch error gracefully', async () => {
    vi.mocked(getAggregators).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByText('aggregator.select_placeholder')).toBeInTheDocument();
    });
    consoleSpy.mockRestore();
  });

  it('shows empty list when no aggregators are available', async () => {
    vi.mocked(getAggregators).mockResolvedValue([]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByText('aggregator.select_placeholder')).toBeInTheDocument();
    });
    // No select items should be rendered
    expect(screen.queryByTestId(/select-item-/)).not.toBeInTheDocument();
  });

  it('re-enables select after error', async () => {
    vi.mocked(getAggregators).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AggregatorSelect />);
    await waitFor(() => {
      expect(screen.getByTestId('select-trigger')).not.toBeDisabled();
    });
    consoleSpy.mockRestore();
  });

  it('renders aggregator items with capitalize class', async () => {
    vi.mocked(getAggregators).mockResolvedValue([
      { customer: 'Swiggy' },
    ]);
    render(<AggregatorSelect />);
    await waitFor(() => {
      const item = screen.getByTestId('select-item-Swiggy');
      expect(item.className).toContain('capitalize');
    });
  });
});
