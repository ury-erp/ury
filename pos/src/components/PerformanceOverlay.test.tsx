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
}));

// ── Tests ──────────────────────────────────────────────────────────

describe('PerformanceOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMetrics = { ...mockMetrics };
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
      fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
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
  });

  describe('expanded state', () => {
    it('should show metric labels', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
      expect(screen.getByText('Connection')).toBeTruthy();
      expect(screen.getByText('Latency')).toBeTruthy();
      expect(screen.getByText('P95')).toBeTruthy();
      expect(screen.getByText('Events')).toBeTruthy();
    });

    it('should show formatted values', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
      expect(screen.getByText('50ms')).toBeTruthy();
      expect(screen.getByText('120ms')).toBeTruthy();
      expect(screen.getByText('10/min')).toBeTruthy();
    });

    it('should show rate limiter section', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
      expect(screen.getByText('Rate Limiter')).toBeTruthy();
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.getByText('Queued')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
    });

    it('should collapse on button click', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
      fireEvent.click(screen.getByTestId('perf-overlay-collapse'));
      expect(screen.getByTestId('perf-overlay-collapsed')).toBeTruthy();
    });

    it('should hide on close click', () => {
      render(<PerformanceOverlay />);
      fireEvent.click(screen.getByTestId('perf-overlay-collapsed'));
      fireEvent.click(screen.getByTestId('perf-overlay-close-expanded'));
      expect(screen.getByTestId('perf-overlay-show')).toBeTruthy();
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
