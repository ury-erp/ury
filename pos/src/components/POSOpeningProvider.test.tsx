import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import POSOpeningProvider from './POSOpeningProvider';

// ---- Mocks ----

const mockCheckPOSOpening = vi.fn();
const mockValidatePOSClose = vi.fn();

vi.mock('../lib/pos-opening-api', () => ({
  checkPOSOpening: (...args: any[]) => mockCheckPOSOpening(...args),
  validatePOSClose: (...args: any[]) => mockValidatePOSClose(...args),
}));

const mockPosProfile = { name: 'Test POS Profile', custom_daily_pos_close: 0 };

const mockUsePOSStore = vi.fn();

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock('./POSOpeningDialog', () => ({
  default: ({ onReload, type }: any) => (
    <div data-testid="pos-opening-dialog" data-type={type}>
      <button data-testid="reload-btn" onClick={onReload}>Reload</button>
    </div>
  ),
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

vi.mock('../lib/error-utils', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'An unexpected error occurred'),
}));

const ChildComponent = () => <div data-testid="child-content">Children Rendered</div>;

describe('POSOpeningProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePOSStore.mockReturnValue({ posProfile: mockPosProfile });
  });

  it('shows loading spinner initially', () => {
    mockCheckPOSOpening.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    expect(screen.getByText('common.checking_pos_status')).toBeInTheDocument();
  });

  it('renders children when POS is already opened and validations pass', async () => {
    mockCheckPOSOpening.mockResolvedValue({ message: 0 }); // POS is opened
    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });

  it('shows opening dialog when POS is not opened (message === 1)', async () => {
    mockCheckPOSOpening.mockResolvedValue({ message: 1 }); // POS not opened
    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('pos-opening-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('pos-opening-dialog')).toHaveAttribute('data-type', 'opening');
    });
  });

  it('shows closing dialog when validatePOSClose returns Failed', async () => {
    mockUsePOSStore.mockReturnValue({
      posProfile: { name: 'Test POS', custom_daily_pos_close: 1 },
    });
    mockCheckPOSOpening.mockResolvedValue({ message: 0 }); // POS is opened
    mockValidatePOSClose.mockResolvedValue({ message: 'Failed' }); // Not closed

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('pos-opening-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('pos-opening-dialog')).toHaveAttribute('data-type', 'closing');
    });
  });

  it('renders children when POS is opened and custom_daily_pos_close passes', async () => {
    mockUsePOSStore.mockReturnValue({
      posProfile: { name: 'Test POS', custom_daily_pos_close: 1 },
    });
    mockCheckPOSOpening.mockResolvedValue({ message: 0 }); // POS is opened
    mockValidatePOSClose.mockResolvedValue({ message: 'Success' }); // Closed

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });

  it('does not call validatePOSClose when custom_daily_pos_close is not enabled', async () => {
    mockUsePOSStore.mockReturnValue({
      posProfile: { name: 'Test POS', custom_daily_pos_close: 0 },
    });
    mockCheckPOSOpening.mockResolvedValue({ message: 0 });

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
    expect(mockValidatePOSClose).not.toHaveBeenCalled();
  });

  it('shows error state when checkPOSOpening throws', async () => {
    mockCheckPOSOpening.mockRejectedValue(new Error('Network error'));

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows error state when validatePOSClose throws', async () => {
    mockUsePOSStore.mockReturnValue({
      posProfile: { name: 'Test POS', custom_daily_pos_close: 1 },
    });
    mockCheckPOSOpening.mockResolvedValue({ message: 0 });
    mockValidatePOSClose.mockRejectedValue(new Error('Validation API error'));

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Validation API error')).toBeInTheDocument();
    });
  });

  it('shows retry button in error state', async () => {
    mockCheckPOSOpening.mockRejectedValue(new Error('Network error'));

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('common.retry')).toBeInTheDocument();
    });
  });

  it('retries check on retry button click', async () => {
    mockCheckPOSOpening
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({ message: 0 }); // Succeeds on retry

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('common.retry')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('common.retry'));
    await waitFor(() => {
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
    expect(mockCheckPOSOpening).toHaveBeenCalledTimes(2);
  });

  it('does not check POS status when posProfile is null', () => {
    mockUsePOSStore.mockReturnValue({ posProfile: null });

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    // Should still be in loading state since posProfile is null
    expect(screen.getByText('common.checking_pos_status')).toBeInTheDocument();
    expect(mockCheckPOSOpening).not.toHaveBeenCalled();
  });

  it('re-checks status when posProfile changes', async () => {
    mockCheckPOSOpening.mockResolvedValue({ message: 0 });
    const { rerender } = render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(mockCheckPOSOpening).toHaveBeenCalledTimes(1);
    });

    // Change the profile
    mockUsePOSStore.mockReturnValue({ posProfile: { name: 'New Profile', custom_daily_pos_close: 0 } });
    mockCheckPOSOpening.mockResolvedValue({ message: 0 });
    rerender(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(mockCheckPOSOpening).toHaveBeenCalledTimes(2);
    });
  });

  it('handles reload button in POSOpeningDialog', async () => {
    mockCheckPOSOpening.mockResolvedValue({ message: 1 }); // Show dialog
    // jsdom doesn't allow spying on window.location.reload directly,
    // so we mock it via Object.defineProperty
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
      configurable: true,
    });

    render(
      <POSOpeningProvider>
        <ChildComponent />
      </POSOpeningProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('reload-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('reload-btn'));
    expect(mockReload).toHaveBeenCalled();
  });
});
