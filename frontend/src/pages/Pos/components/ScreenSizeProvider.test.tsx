import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import ScreenSizeProvider from './ScreenSizeProvider';

vi.mock('./ScreenSizeDialog', () => ({
  default: () => <div data-testid="screen-size-dialog">Screen Size Dialog</div>,
}));

describe('ScreenSizeProvider', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when screen width is >= 1024px', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    render(
      <ScreenSizeProvider>
        <div data-testid="child-content">Test Content</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.queryByTestId('screen-size-dialog')).not.toBeInTheDocument();
  });

  it('shows ScreenSizeDialog when screen width is < 1024px', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });

    render(
      <ScreenSizeProvider>
        <div data-testid="child-content">Test Content</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByTestId('screen-size-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  it('exempts Captain routes from size check', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { pathname: '/ury/order-list' },
    });

    render(
      <ScreenSizeProvider>
        <div data-testid="child-content">Captain Route</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('cleans up resize listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <ScreenSizeProvider>
        <div data-testid="child-content">Test Content</div>
      </ScreenSizeProvider>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
