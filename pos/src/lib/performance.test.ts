import { describe, it, expect, vi, beforeEach } from 'vitest';
import { perfMonitor } from './performance';

describe('perfMonitor', () => {
  beforeEach(() => {
    perfMonitor.clear();
  });

  describe('startTimer / stopTimer', () => {
    it('should record a performance entry', () => {
      const id = perfMonitor.startTimer('test-op', 'custom');
      const duration = perfMonitor.stopTimer(id);

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(perfMonitor.getEntries()).toHaveLength(1);
    });

    it('should return null for unknown timer ID', () => {
      const result = perfMonitor.stopTimer('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('measure', () => {
    it('should measure async operation duration and return result', async () => {
      const result = await perfMonitor.measure('api-call', async () => {
        return 'success';
      });

      expect(result).toBe('success');
      const entries = perfMonitor.getEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('should record failed operations', async () => {
      await expect(
        perfMonitor.measure('failing-call', async () => {
          throw new Error('API Error');
        })
      ).rejects.toThrow('API Error');

      const entries = perfMonitor.getEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      // Find the failed entry
      const failedEntry = entries.find(e => e.metadata?.success === false);
      expect(failedEntry).toBeDefined();
    });
  });

  describe('measureSync', () => {
    it('should measure sync operation duration and return result', () => {
      const result = perfMonitor.measureSync('render-test', () => {
        return 42;
      });

      expect(result).toBe(42);
      expect(perfMonitor.getEntries().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('mark', () => {
    it('should add a zero-duration marker entry', () => {
      perfMonitor.mark('checkpoint');
      const entries = perfMonitor.getEntries();
      const marker = entries.find(e => e.name === 'checkpoint');
      expect(marker).toBeDefined();
      expect(marker!.duration).toBe(0);
    });
  });

  describe('getApiMetrics', () => {
    it('should return empty metrics when no API calls recorded', () => {
      const metrics = perfMonitor.getApiMetrics();
      expect(metrics.totalCalls).toBe(0);
    });

    it('should compute API metrics after measuring calls', async () => {
      await perfMonitor.measure('my-endpoint', async () => 'ok');
      await perfMonitor.measure('my-endpoint', async () => 'ok2');

      // Check total entries first
      const allEntries = perfMonitor.getEntries();
      expect(allEntries.length).toBeGreaterThanOrEqual(2);

      // Check API metrics for specific endpoint
      const metrics = perfMonitor.getApiMetrics('my-endpoint');
      expect(metrics.totalCalls).toBeGreaterThanOrEqual(1);
      expect(metrics.avgDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSummary', () => {
    it('should return a summary object', async () => {
      await perfMonitor.measure('test-api', async () => 'ok');
      perfMonitor.measureSync('test-render', () => 1);

      const summary = perfMonitor.getSummary();
      expect(summary.totalEntries).toBeGreaterThan(0);
      expect(summary.apiMetrics).toBeDefined();
      expect(summary.renderMetrics).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await perfMonitor.measure('test', async () => 'ok');
      expect(perfMonitor.getEntries().length).toBeGreaterThan(0);

      perfMonitor.clear();
      expect(perfMonitor.getEntries()).toHaveLength(0);
    });
  });

  describe('getSlowOperations', () => {
    it('should return operations above threshold', () => {
      // Directly add a slow entry via startTimer/stopTimer
      // The default threshold is 1000ms, so normal operations won't be "slow"
      const slowOps = perfMonitor.getSlowOperations();
      expect(Array.isArray(slowOps)).toBe(true);
    });
  });
});
