import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call } from '@ury/core';
import { dashboardService } from './dashboard';

vi.mock('@ury/core', () => ({ call: Object.assign(vi.fn(), { get: vi.fn() }) }));

describe('Service Board summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('propagates API failures instead of fabricating zero metrics', async () => {
    vi.mocked(call.get).mockRejectedValueOnce(new Error('Unknown company column'));
    await expect(dashboardService.getSummary('URY Barsha', 'URY UAE')).rejects.toThrow('Unknown company column');
  });
});
