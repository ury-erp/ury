import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ScreenSizeProvider from './ScreenSizeProvider';

// ---- Mocks ----

vi.mock('./ScreenSizeDialog', () => ({
  default: () => <div data-testid="screen-size-dialog">Screen Too Small</div>,
}));

const ChildComponent = () => <div data-testid="child-content">Children Rendered</div>;

describe('ScreenSizeProvider', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('renders children when screen width is >= 1024', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.queryByTestId('screen-size-dialog')).not.toBeInTheDocument();
  });

  it('renders children when screen width is large (1440)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1440,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('shows ScreenSizeDialog when screen width is < 1024', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('screen-size-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  it('shows ScreenSizeDialog when screen width is exactly 1023', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1023,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('screen-size-dialog')).toBeInTheDocument();
  });

  it('does not show dialog when screen width is exactly 1024', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.queryByTestId('screen-size-dialog')).not.toBeInTheDocument();
  });

  it('shows dialog for very small screens (320px)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 320,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('screen-size-dialog')).toBeInTheDocument();
  });

  it('responds to window resize from large to small', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();

    // Resize to small
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByTestId('screen-size-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  it('responds to window resize from small to large', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('screen-size-dialog')).toBeInTheDocument();

    // Resize to large
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.queryByTestId('screen-size-dialog')).not.toBeInTheDocument();
  });

  it('cleans up resize listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    const { unmount } = render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('does not show dialog when width is just at threshold boundary (1025)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1025,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('handles multiple resize events without issues', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200,
    });
    render(
      <ScreenSizeProvider>
        <ChildComponent />
      </ScreenSizeProvider>
    );

    act(() => { window.dispatchEvent(new Event('resize')); });
    act(() => { window.dispatchEvent(new Event('resize')); });
    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});
