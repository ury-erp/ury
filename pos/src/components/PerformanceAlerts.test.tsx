import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import PerformanceAlerts from '../components/PerformanceAlerts';

// ── Mocks ──────────────────────────────────────────────────────────
// vi.mock is hoisted, so we use vi.fn() inline and import the mocked module

vi.mock('./ui/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../i18n', () => ({
  i18n: { t: (_key: string, fallback: string) => fallback },
}));

const defaultMetrics = {
  latency: 50,
  latencyP95: 120,
  eventRate: 10,
  connectionState: 'connected' as const,
  timeSinceLastResponse: 100,
  rateLimiter: {
    totalRequests: 100,
    completedRequests: 95,
    failedRequests: 3,
    timedOutRequests: 1,
    rejectedRequests: 1,
    queueDrops: 0,
    activeRequests: 2,
    queuedRequests: 0,
    availableTokens: { critical: 8, normal: 4, low: 1 },
    avgQueueWaitMs: 0,
    isOverloaded: false,
  },
  isDegraded: false,
  isCritical: false,
};

let currentMetrics = { ...defaultMetrics };

vi.mock('../hooks/use-performance-monitor', () => ({
  usePerformanceMonitor: () => currentMetrics,
  usePerformanceSummary: () => 'OK',
}));

// Import mocked module after mock declarations
import { showToast } from './ui/toast';

// ── Tests ──────────────────────────────────────────────────────────

describe('PerformanceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMetrics = { ...defaultMetrics };
  });

  it('should render null (no DOM output)', () => {
    const { container } = render(<PerformanceAlerts />);
    expect(container.innerHTML).toBe('');
  });

  it('should not fire toasts when healthy', () => {
    render(<PerformanceAlerts />);
    expect(showToast.error).not.toHaveBeenCalled();
    expect(showToast.warning).not.toHaveBeenCalled();
    expect(showToast.info).not.toHaveBeenCalled();
  });

  it('should fire error toast on critical latency', () => {
    currentMetrics = { ...defaultMetrics, isCritical: true, latency: 2500, connectionState: 'disconnected' };
    render(<PerformanceAlerts />);
    expect(showToast.error).toHaveBeenCalled();
  });

  it('should fire warning toast on degraded latency', () => {
    currentMetrics = { ...defaultMetrics, isDegraded: true, latency: 600 };
    render(<PerformanceAlerts />);
    expect(showToast.warning).toHaveBeenCalled();
  });

  it('should not crash with null latency', () => {
    currentMetrics = { ...defaultMetrics, latency: null, latencyP95: null };
    expect(() => render(<PerformanceAlerts />)).not.toThrow();
  });

  it('should not crash when disconnected', () => {
    currentMetrics = { ...defaultMetrics, connectionState: 'disconnected', isCritical: true, latency: 3000 };
    expect(() => render(<PerformanceAlerts />)).not.toThrow();
  });
});
