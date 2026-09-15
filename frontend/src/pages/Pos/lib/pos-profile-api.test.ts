import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callGetMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: unknown[]) => callGetMock(...args),
  },
  db: {
    getDoc: (...args: unknown[]) => getDocMock(...args),
  },
}));

import {
  getCombinedPosProfile,
  getCurrencyInfo,
  getPosProfileFull,
  getPosProfileLimitedFields,
  PosProfileFull,
  PosProfileLimited,
} from './pos-profile-api';

const buildLimited = (overrides: Partial<PosProfileLimited> = {}): PosProfileLimited => ({
  pos_profile: 'Kozhikode POS',
  branch: 'Kozhikode',
  company: 'URY',
  waiter: 'waiter@example.com',
  warehouse: 'Kozhikode - URY',
  cashier: 'cashier@example.com',
  print_format: 'Standard',
  qz_print: 0,
  qz_host: null,
  printer: null,
  print_type: 'Browser',
  tableAttention: 0,
  paid_limit: 5000,
  disable_rounded_total: 0,
  enable_discount: 1,
  multiple_cashier: 0,
  owner: 'admin@example.com',
  ...overrides,
});

const buildFull = (overrides: Partial<PosProfileFull> = {}): PosProfileFull => ({
  name: 'Kozhikode POS',
  owner: 'admin@example.com',
  creation: '2026-01-01 00:00:00',
  modified: '2026-01-01 00:00:00',
  modified_by: 'admin@example.com',
  docstatus: 0,
  idx: 1,
  company: 'URY',
  customer: null,
  country: 'India',
  disabled: 0,
  warehouse: 'Kozhikode - URY',
  campaign: null,
  company_address: null,
  restaurant: 'URY Kozhikode',
  branch: 'Kozhikode',
  currency: 'INR',
  role_allowed_for_billing: [],
  ...overrides,
});

describe('getPosProfileLimitedFields', () => {
  beforeEach(() => callGetMock.mockReset());

  it('calls getPosProfile and unwraps the message envelope', async () => {
    const limited = buildLimited();
    callGetMock.mockResolvedValueOnce({ message: limited });

    const result = await getPosProfileLimitedFields();

    expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.getPosProfile');
    expect(result).toEqual(limited);
  });
});

describe('getPosProfileFull', () => {
  beforeEach(() => getDocMock.mockReset());

  it('fetches the POS Profile doctype by name', async () => {
    const full = buildFull();
    getDocMock.mockResolvedValueOnce(full);

    const result = await getPosProfileFull('Kozhikode POS');

    expect(getDocMock).toHaveBeenCalledWith('POS Profile', 'Kozhikode POS');
    expect(result).toEqual(full);
  });
});

describe('getCurrencyInfo', () => {
  beforeEach(() => getDocMock.mockReset());

  it('fetches the Currency doctype by code', async () => {
    const currency = {
      name: 'INR',
      symbol: 'Rs',
      fraction: 'Paisa',
      fraction_units: 100,
      smallest_currency_fraction_value: 0.5,
      number_format: '#,###.##',
    };
    getDocMock.mockResolvedValueOnce(currency);

    const result = await getCurrencyInfo('INR');

    expect(getDocMock).toHaveBeenCalledWith('Currency', 'INR');
    expect(result).toEqual(currency);
  });
});

describe('getCombinedPosProfile', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  beforeEach(() => {
    callGetMock.mockReset();
    getDocMock.mockReset();
    consoleLogSpy.mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('fetches the limited profile first, then the full profile by the limited profile\'s pos_profile name', async () => {
    const limited = buildLimited({ pos_profile: 'Kozhikode POS' });
    const full = buildFull({ name: 'Kozhikode POS' });
    callGetMock.mockResolvedValueOnce({ message: limited });
    getDocMock.mockResolvedValueOnce(full);

    await getCombinedPosProfile();

    expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.getPosProfile');
    expect(getDocMock).toHaveBeenCalledWith('POS Profile', 'Kozhikode POS');
  });

  it('merges the full profile with the limited-only fields, with limited fields taking precedence on overlap', async () => {
    const limited = buildLimited({
      owner: 'limited-owner@example.com',
      waiter: 'waiter1@example.com',
      cashier: 'cashier1@example.com',
      paid_limit: 9999,
    });
    const full = buildFull({ owner: 'full-owner@example.com', paid_limit: 1 });
    callGetMock.mockResolvedValueOnce({ message: limited });
    getDocMock.mockResolvedValueOnce(full);

    const result = await getCombinedPosProfile();

    // Limited-profile-sourced fields win over whatever the full profile carried.
    expect(result.owner).toBe('limited-owner@example.com');
    expect(result.paid_limit).toBe(9999);
    expect(result.waiter).toBe('waiter1@example.com');
    expect(result.cashier).toBe('cashier1@example.com');
    // Fields only present on the full profile are preserved.
    expect(result.branch).toBe(full.branch);
    expect(result.restaurant).toBe(full.restaurant);
    expect(result.currency).toBe(full.currency);
  });

  it('propagates a rejection from the limited-profile fetch without calling getDoc', async () => {
    callGetMock.mockRejectedValueOnce(new Error('403 Forbidden'));

    await expect(getCombinedPosProfile()).rejects.toThrow('403 Forbidden');
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('propagates a rejection from the full-profile fetch', async () => {
    callGetMock.mockResolvedValueOnce({ message: buildLimited() });
    getDocMock.mockRejectedValueOnce(new Error('POS Profile not found'));

    await expect(getCombinedPosProfile()).rejects.toThrow('POS Profile not found');
  });
});
