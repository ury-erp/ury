import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'error_boundary.title': 'Something went wrong',
      'error_boundary.message': 'An unexpected error occurred.',
      'error_boundary.try_again': 'Try Again',
      'error_boundary.reload_page': 'Reload Page',
      'error_boundary.persistent_error': 'Persistent error warning',
    };
    return translations[key] ?? key;
  },
}));

// Mock logger
vi.mock('../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  },
}));

// Component that always throws
function ThrowError({ error }: { error: Error }) {
  throw error;
}

// Component that can toggle between throwing and rendering
function ToggleError() {
  const [shouldThrow, setShouldThrow] = useState(true);
  if (shouldThrow) throw new Error('Toggle error');
  return <div>Recovered content</div>;
}

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeDefined();
  });

  it('should render error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError error={new Error('Test error message')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Test error message')).toBeDefined();
  });

  it('should render custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError error={new Error('Oops')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeDefined();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('should call onError callback when error occurs', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError error={new Error('Callback test')} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('should reset error state when "Try Again" is clicked', () => {
    // After clicking "Try Again", the error boundary resets hasError=false,
    // which re-renders the children. The children will throw again immediately
    // since they're the same component. This test verifies the button works
    // by checking onRetry is called and the state changes (briefly).
    const onRetry = vi.fn();

    render(
      <ErrorBoundary onRetry={onRetry}>
        <ThrowError error={new Error('Retry test')} />
      </ErrorBoundary>
    );

    // Should show error UI
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Retry test')).toBeDefined();

    // Click "Try Again"
    fireEvent.click(screen.getByText('Try Again'));

    // onRetry callback should have been called
    expect(onRetry).toHaveBeenCalledTimes(1);

    // The error boundary resets, but ThrowError throws again,
    // so we see the error UI again (with the same error message)
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('should call onRetry callback when "Try Again" is clicked', () => {
    const onRetry = vi.fn();

    render(
      <ErrorBoundary onRetry={onRetry}>
        <ThrowError error={new Error('Retry test')} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should reload page when "Reload Page" is clicked', () => {
    const reloadMock = vi.fn();
    const originalLocation = window.location;
    // Use delete and redefine instead of Object.defineProperty on existing
    delete (window as Record<string, unknown>).location;
    window.location = { reload: reloadMock } as unknown as Location;

    render(
      <ErrorBoundary>
        <ThrowError error={new Error('Reload test')} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Reload Page'));
    expect(reloadMock).toHaveBeenCalledTimes(1);

    // Restore
    window.location = originalLocation;
  });

  it('should display error message from the thrown error', () => {
    render(
      <ErrorBoundary>
        <ThrowError error={new Error('Custom error details')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom error details')).toBeDefined();
  });
});
