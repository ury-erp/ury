import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../i18n';
import { getPOSOpeningContext, type POSOpeningContext } from '../lib/pos-opening-api';
import POSOpeningScreen from './POSOpeningScreen';

vi.mock('../store/root-store', () => ({ useRootStore: () => ({ user: null }) }));
vi.mock('../lib/pos-opening-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/pos-opening-api')>(),
  getPOSOpeningContext: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

const context: POSOpeningContext = {
  company: 'Test Co',
  allowed_profiles: [{ name: 'POS-1' }],
  selected_profile: 'POS-1',
  payment_modes: [],
  user: 'cashier@example.com',
  user_full_name: 'Current Cashier',
  branch: 'Branch A',
  restaurant: 'Rest A',
  daily_close_pending: false,
  multi_cashier: { enabled: false, main_cashier_open: false, main_cashier_configured: false },
  permissions: { create: true, submit: true },
  occupied_entry: {
    user: 'other@example.com',
    user_full_name: 'Other Cashier',
    period_start_date: '2026-10-01 08:10:00',
  },
};

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await initI18n('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderContext(data = context) {
  vi.mocked(getPOSOpeningContext).mockResolvedValue(data);
  await act(async () => root.render(<POSOpeningScreen />));
  return container.querySelector('p.text-orange-700')?.textContent || '';
}

describe('occupied till message', () => {
  it('formats the start time for humans rather than showing the raw database timestamp', async () => {
    const message = await renderContext();
    expect(message).toContain('since 10/1/2026, 8:10:00 AM');
    expect(message).not.toContain('2026-10-01 08:10:00');
  });

  it('shows the holder full name without their email address', async () => {
    const message = await renderContext();
    expect(message).toContain('Other Cashier');
    expect(container.textContent).not.toContain('other@example.com');
  });

  it('never displays the email fallback when the holder has no full name', async () => {
    const message = await renderContext({
      ...context,
      occupied_entry: { ...context.occupied_entry!, user_full_name: 'other@example.com' },
    });
    expect(message).toContain('POS-1');
    expect(container.textContent).not.toContain('other@example.com');
  });

  it('renders an Arabic occupied-till message with the profile and holder', async () => {
    await initI18n('ar');
    const message = await renderContext();
    expect(message).toMatch(/[\u0600-\u06ff]/);
    expect(message).toContain('POS-1');
    expect(message).toContain('Other Cashier');
    expect(message).not.toContain('{{');
  });
});
