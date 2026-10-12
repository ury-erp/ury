import { describe, expect, it } from 'vitest';
import { nextConnectionState, probeIntervalMs } from './connectivity';
import type { ConnectionState, ConnectivitySignal } from './connectivity';

/**
 * The transitions, especially the one that looks wrong.
 *
 * `navigator.onLine` turning true must NOT put the POS back to 'online'.
 * It only means a network interface exists, which is exactly what a
 * restaurant router keeps reporting while its uplink is dead — and
 * believing it is how a cashier ends up finding out by pressing Pay.
 */
const cases: { from: ConnectionState; signal: ConnectivitySignal; expected: ConnectionState; note: string }[] = [
  { from: 'online', signal: 'browser-offline', expected: 'offline', note: 'a false onLine is the one thing it is right about' },
  { from: 'checking', signal: 'browser-offline', expected: 'offline', note: 'no interface, no debate' },
  { from: 'offline', signal: 'browser-online', expected: 'checking', note: 'interface up is not server reachable' },
  { from: 'checking', signal: 'browser-online', expected: 'checking', note: 'still unproven' },
  { from: 'online', signal: 'browser-online', expected: 'online', note: 'nothing changed' },
  { from: 'offline', signal: 'probe-ok', expected: 'online', note: 'the server answered' },
  { from: 'checking', signal: 'probe-ok', expected: 'online', note: 'confirmed' },
  { from: 'online', signal: 'probe-failed', expected: 'offline', note: 'it stopped answering' },
];

describe('connectivity transitions', () => {
  it.each(cases)('$from + $signal => $expected ($note)', ({ from, signal, expected }) => {
    expect(nextConnectionState(from, signal)).toBe(expected);
  });
});

describe('probe cadence', () => {
  it('asks more often while down than while up', () => {
    // Recovery has to be noticed quickly, or the banner outlives the outage
    // and the cashier stops believing it.
    expect(probeIntervalMs('offline')).toBeLessThan(probeIntervalMs('online'));
  });

  it('treats an unconfirmed link as eagerly as a broken one', () => {
    expect(probeIntervalMs('checking')).toBeLessThan(probeIntervalMs('online'));
  });
});
