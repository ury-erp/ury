import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { ProgressModal } from './ProgressModal';

// A socket that never delivers an event: it reports "subscribed" (mirroring
// realtimeClient's behaviour when the connection fails) and then goes quiet.
// This is the case the HTTP poll exists for.
const deadSocket = vi.fn((_event: string, _handler: unknown, onSubscribed?: () => void) => {
  onSubscribed?.();
  return () => {};
});

vi.mock('../../lib/realtimeClient', () => ({
  subscribeRealtimeEvent: (event: string, handler: unknown, onSubscribed?: () => void) =>
    deadSocket(event, handler, onSubscribed),
}));

describe('ProgressModal HTTP fallback', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reports a background setup failure that only the poll sees', async () => {
    const onFail = vi.fn();
    const poll = vi.fn().mockResolvedValue({
      status: 'fail',
      fail_msg: 'Failed to load restaurant demo masters',
    });

    render(
      <ProgressModal visible activeIndex={0} onFail={onFail} poll={poll} pollIntervalMs={10} />
    );

    await waitFor(() => {
      expect(onFail).toHaveBeenCalledWith('Failed to load restaurant demo masters');
    });
  });

  it('completes from the poll when no setup_task event arrives', async () => {
    const onComplete = vi.fn();
    const poll = vi.fn().mockResolvedValue({ status: 'ok' });

    render(
      <ProgressModal
        visible
        activeIndex={0}
        onComplete={onComplete}
        poll={poll}
        pollIntervalMs={10}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('acts on the terminal status once even if the poll repeats it', async () => {
    const onComplete = vi.fn();
    const poll = vi.fn().mockResolvedValue({ status: 'ok' });

    render(
      <ProgressModal
        visible
        activeIndex={0}
        onComplete={onComplete}
        poll={poll}
        pollIntervalMs={5}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting when the poll itself fails', async () => {
    const onFail = vi.fn();
    const onComplete = vi.fn();
    const poll = vi.fn().mockRejectedValue(new Error('network down'));

    render(
      <ProgressModal
        visible
        activeIndex={0}
        onFail={onFail}
        onComplete={onComplete}
        poll={poll}
        pollIntervalMs={5}
      />
    );

    await waitFor(() => expect(poll.mock.calls.length).toBeGreaterThan(1));
    expect(onFail).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not poll when no poller is supplied', async () => {
    render(<ProgressModal visible activeIndex={0} />);
    await waitFor(() => expect(deadSocket).toHaveBeenCalled());
  });
});
