import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PerformanceOverlay from '../components/PerformanceOverlay';

// ── Mocks ──────────────────────────────────────────────────────────

const mockMetrics = {
  latency: 50,
  latencyP95: 120,
  eventRate: 10,
  connectionState: 'connected' as const,
  timeSinceLastResponse: 100,
  rateLimiter: {
    totalRequests: 100,
    completedRequests: 95,
    failedRequests: 0,
    timedOutRequests: 0,
    rejectedRequests: 0,
    queueDrops: 0,
    activeRequests: 2,
    queuedRequests: 0,
    maxConcurrent: 6,
    availableTokens: { critical: 8, normal: 4, low: 1 },
    avgQueueWaitMs: 0,
    isOverloaded: false,
  },
  isDegraded: false,
  isCritical: false,
};

let currentMetrics = { ...mockMetrics };

vi.mock('../hooks/use-performance-monitor', () => ({
  usePerformanceMonitor: () => currentMetrics,
  usePerformanceSummary: () => 'OK: latency 50ms, 10 events/min',
}));

vi.mock('../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Activity: () => <span data-testid="icon-activity">Activity</span>,
  X: () => <span data-testid="icon-x">X</span>,
  ChevronUp: () => <span data-testid="icon-chevron-up">ChevronUp</span>,
  ChevronDown: () => <span data-testid="icon-chevron-down">ChevronDown</span>,
  Zap: () => <span data-testid="icon-zap">Zap</span>,
  Clock: () => <span data-testid="icon-clock">Clock</span>,
  Wifi: () => <span data-testid="icon-wifi">Wifi</span>,
  WifiOff: () => <span data-testid="icon-wifioff">WifiOff</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AlertTriangle</span>,
  Gauge: () => <span data-testid="icon-gauge">Gauge</span>,
  Timer: () => <span data-testid="icon-timer">Timer</span>,
}));

// ── Helpers ────────────────────────────────────────────────────────

function expandOverlay() {
  fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
}

function setRateLimiter(overrides: Partial<typeof mockMetrics.rateLimiter>) {
  currentMetrics = {
    ...mockMetrics,
    rateLimiter: { ...mockMetrics.rateLimiter, ...overrides },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PerformanceOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMetrics = { ...mockMetrics, rateLimiter: { ...mockMetrics.rateLimiter } };
  });

  describe('collapsed state', () => {
    it('should render collapsed view by default', () => {
      render(<PerformanceOverlay />);
      expect(screen.getByTestId('perf-overlay-collapsed')).toBeTruthy();
    });

    it('should show connection status text', () => {
      render(<PerformanceOverlay />);
      expect(screen.getByText('OK')).toBeTruthy();
    });

    it('should show latency value', () => {
      render(<PerformanceOverlay />);
      expect(screen.getByText('50ms')).toBeTruthy();
    });

    it('should show event rate', () => {
      render(<PerformanceOverlay />);
      expect(screen.getByText('10/m')).toBeTruthy();
    });

    it('should expand on click', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByTestId('perf-overlay-expanded')).toBeTruthy();
    });

    it('should hide on close click', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-close'));
      expect(screen.getByTestId('perf-overlay-show')).toBeTruthy();
    });

    it('should show amber color for degraded state', () => {
      currentMetrics = { ...mockMetrics, connectionState: 'degraded', isDegraded: true };
      render(<PerformanceOverlay />);
      const statusEl = screen.getByText('DEGRADED');
      expect(statusEl.className).toContain('amber');
    });

    it('should show red color for critical state', () => {
      currentMetrics = { ...mockMetrics, connectionState: 'disconnected', isCritical: true };
      render(<PerformanceOverlay />);
      const statusEl = screen.getByText('DOWN');
      expect(statusEl.className).toContain('red');
    });

    it('should not crash with null latency', () => {
      currentMetrics = { ...mockMetrics, latency: null };
      expect(() => render(<PerformanceOverlay />)).not.toThrow();
    });

    it('should show queued indicator when requests are queued', () => {
      setRateLimiter({ queuedRequests: 3 });
      render(<PerformanceOverlay />);
      expect(screen.getByText('3q')).toBeTruthy();
    });

    it('should not show queued indicator when no requests queued', () => {
      setRateLimiter({ queuedRequests: 0 });
      render(<PerformanceOverlay />);
      expect(screen.queryByText(/q$/)).toBeNull();
    });
  });

  describe('expanded state', () => {
    it('should show metric labels', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Connection')).toBeTruthy();
      expect(screen.getByText('Latency')).toBeTruthy();
      expect(screen.getByText('P95')).toBeTruthy();
      expect(screen.getByText('Events')).toBeTruthy();
    });

    it('should show formatted values', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('50ms')).toBeTruthy();
      expect(screen.getByText('120ms')).toBeTruthy();
      expect(screen.getByText('10/min')).toBeTruthy();
    });

    it('should show rate limiter section', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Rate Limiter')).toBeTruthy();
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.getByText('Queued')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
    });

    it('should show active requests with max concurrent', () => {
      setRateLimiter({ activeRequests: 4, maxConcurrent: 6 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('4/6')).toBeTruthy();
    });

    it('should show 0/max when no active requests', () => {
      setRateLimiter({ activeRequests: 0, maxConcurrent: 6 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('0/6')).toBeTruthy();
    });

    it('should collapse on button click', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      fireEvent.click(screen.getByTestId('perf-overlay-collapse'));
      expect(screen.getByTestId('perf-overlay-collapsed')).toBeTruthy();
    });

    it('should hide on close click', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      fireEvent.click(screen.getByTestId('perf-overlay-close-expanded'));
      expect(screen.getByTestId('perf-overlay-show')).toBeTruthy();
    });
  });

  describe('rate limiter error metrics', () => {
    it('should show errors section when failedRequests > 0', () => {
      setRateLimiter({ failedRequests: 3 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Errors')).toBeTruthy();
      expect(screen.getByText('Failed')).toBeTruthy();
    });

    it('should show Failed count in red', () => {
      setRateLimiter({ failedRequests: 5 });
      render(<PerformanceOverlay />);
      expandOverlay();
      const failedEl = screen.getByText('5');
      expect(failedEl.className).toContain('red');
    });

    it('should show Timeouts when timedOutRequests > 0', () => {
      setRateLimiter({ timedOutRequests: 2 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Timeouts')).toBeTruthy();
    });

    it('should show Rejected when rejectedRequests > 0', () => {
      setRateLimiter({ rejectedRequests: 1 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Rejected')).toBeTruthy();
    });

    it('should show Dropped when queueDrops > 0', () => {
      setRateLimiter({ queueDrops: 2 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Dropped')).toBeTruthy();
    });

    it('should not show errors section when all error counts are zero', () => {
      setRateLimiter({
        failedRequests: 0,
        timedOutRequests: 0,
        rejectedRequests: 0,
        queueDrops: 0,
      });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.queryByText('Errors')).toBeNull();
      expect(screen.queryByText('Failed')).toBeNull();
      expect(screen.queryByText('Timeouts')).toBeNull();
      expect(screen.queryByText('Rejected')).toBeNull();
      expect(screen.queryByText('Dropped')).toBeNull();
    });
  });

  describe('token availability display', () => {
    it('should show Tokens section', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Tokens')).toBeTruthy();
    });

    it('should show priority labels CRT, NRM, LOW', () => {
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('CRT')).toBeTruthy();
      expect(screen.getByText('NRM')).toBeTruthy();
      expect(screen.getByText('LOW')).toBeTruthy();
    });

    it('should show token count numbers', () => {
      setRateLimiter({
        availableTokens: { critical: 8, normal: 4, low: 1 },
      });
      render(<PerformanceOverlay />);
      expandOverlay();
      // Token count spans — check for the numbers
      expect(screen.getByText('8')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy();
    });
  });

  describe('avg queue wait display', () => {
    it('should not show Avg Wait when avgQueueWaitMs is 0', () => {
      setRateLimiter({ avgQueueWaitMs: 0 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.queryByText('Avg Wait')).toBeNull();
    });

    it('should show Avg Wait in ms when < 1000ms', () => {
      setRateLimiter({ avgQueueWaitMs: 150 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Avg Wait')).toBeTruthy();
      expect(screen.getByText('150ms')).toBeTruthy();
    });

    it('should show Avg Wait in seconds when >= 1000ms', () => {
      setRateLimiter({ avgQueueWaitMs: 2500 });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('2.5s')).toBeTruthy();
    });

    it('should show red color for Avg Wait > 1000ms', () => {
      setRateLimiter({ avgQueueWaitMs: 1500 });
      render(<PerformanceOverlay />);
      expandOverlay();
      const waitValue = screen.getByText('1.5s');
      expect(waitValue.className).toContain('red');
    });

    it('should show amber color for Avg Wait > 200ms but < 1000ms', () => {
      setRateLimiter({ avgQueueWaitMs: 500 });
      render(<PerformanceOverlay />);
      expandOverlay();
      const waitValue = screen.getByText('500ms');
      expect(waitValue.className).toContain('amber');
    });

    it('should show normal color for Avg Wait <= 200ms', () => {
      setRateLimiter({ avgQueueWaitMs: 100 });
      render(<PerformanceOverlay />);
      expandOverlay();
      const waitValue = screen.getByText('100ms');
      expect(waitValue.className).toContain('gray-200');
    });
  });

  describe('overload warning', () => {
    it('should show overload warning when isOverloaded is true', () => {
      setRateLimiter({ isOverloaded: true });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.getByText('Queue overloaded')).toBeTruthy();
    });

    it('should not show overload warning when isOverloaded is false', () => {
      setRateLimiter({ isOverloaded: false });
      render(<PerformanceOverlay />);
      expandOverlay();
      expect(screen.queryByText('Queue overloaded')).toBeNull();
    });
  });

  describe('hidden state', () => {
    it('should return to collapsed on show button click', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-close'));
      expect(screen.getByTestId('perf-overlay-show')).toBeTruthy();
      fireEvent.click(screen.getByTestId('perf-overlay-show'));
      expect(screen.getByTestId('perf-overlay-collapsed')).toBeTruthy();
    });
  });
});
