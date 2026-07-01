import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NetworkStatus } from './NetworkStatus';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

describe('NetworkStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });
  });

  it('should not render anything when online', () => {
    const { container } = render(<NetworkStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('should render offline banner when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    render(<NetworkStatus />);

    expect(screen.getByText('network.offline')).toBeDefined();
  });

  it('should show offline banner when going from online to offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    render(<NetworkStatus />);

    // Initially online — nothing rendered
    expect(screen.queryByText('network.offline')).toBeNull();

    // Simulate going offline
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('network.offline')).toBeDefined();
  });

  it('should show "back online" when transitioning from offline to online', () => {
    // Start offline
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    render(<NetworkStatus />);

    // Verify offline banner is shown
    expect(screen.getByText('network.offline')).toBeDefined();

    // Simulate going back online
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    // Should show "back online" message
    expect(screen.getByText('network.back_online')).toBeDefined();
  });

  it('should use WifiOff icon when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    render(<NetworkStatus />);

    // The offline banner should contain a WifiOff icon (SVG)
    const banner = screen.getByText('network.offline').closest('div');
    expect(banner?.querySelector('svg')).toBeDefined();
  });
});
