import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appLabelForPath,
  buildDeskUrl,
  getCurrentReturnContext,
  isReturnPathAllowed,
  withReturnContext,
} from '@ury/core';

describe('deskLink helpers', () => {
  beforeEach(() => {
    // Reset window.location mock before each test
    delete (window as any).location;
  });

  afterEach(() => {
    // Clean up the mock after each test
    vi.restoreAllMocks();
  });

  it('buildDeskUrl slugifies the doctype', () => {
    const url = buildDeskUrl('URY Issue Wastage', 'WST-0001', { returnTo: null });
    expect(url).toBe('/app/ury-issue-wastage/WST-0001');
  });

  it('buildDeskUrl URL-encodes the docname (with spaces and slashes)', () => {
    const url1 = buildDeskUrl('URY Item', 'Item With Spaces', { returnTo: null });
    expect(url1).toBe('/app/ury-item/Item%20With%20Spaces');

    const url2 = buildDeskUrl('URY Item', 'Item/With/Slashes', { returnTo: null });
    expect(url2).toBe('/app/ury-item/Item%2FWith%2FSlashes');
  });

  it('buildDeskUrl with null docname gives the list route without trailing slash', () => {
    const url = buildDeskUrl('URY Issue Wastage', null, { returnTo: null });
    expect(url).toBe('/app/ury-issue-wastage');
  });

  it('buildDeskUrl without docname gives the list route without trailing slash', () => {
    const url = buildDeskUrl('URY Issue Wastage', undefined, { returnTo: null });
    expect(url).toBe('/app/ury-issue-wastage');
  });

  it('buildDeskUrl with explicit returnTo includes encoded params', () => {
    const url = buildDeskUrl('URY Issue Wastage', 'WST-0001', {
      returnTo: { path: '/ury/wastage', label: 'URY' },
    });
    expect(url).toContain('/app/ury-issue-wastage/WST-0001?');
    expect(url).toContain('ury_return_to=%2Fury%2Fwastage');
    expect(url).toContain('ury_return_label=URY');
  });

  it('withReturnContext appends params with ? when path has no query string', () => {
    const url = withReturnContext('/app', {
      returnTo: { path: '/ury/wastage', label: 'URY' },
    });
    expect(url).toContain('/app?');
    expect(url).toContain('ury_return_to=%2Fury%2Fwastage');
    expect(url).toContain('ury_return_label=URY');
  });

  it('withReturnContext appends params with & when path has existing query string', () => {
    const url = withReturnContext('/app?view=list', {
      returnTo: { path: '/ury/wastage', label: 'URY' },
    });
    expect(url).toContain('/app?view=list&');
    expect(url).toContain('ury_return_to=%2Fury%2Fwastage');
    expect(url).toContain('ury_return_label=URY');
  });

  it('isReturnPathAllowed allows valid paths', () => {
    expect(isReturnPathAllowed('/ury')).toBe(true);
    expect(isReturnPathAllowed('/ury/wastage')).toBe(true);
    expect(isReturnPathAllowed('/pos/orders')).toBe(true);
    expect(isReturnPathAllowed('/mosaic')).toBe(true);
    expect(isReturnPathAllowed('/urypos')).toBe(true);
    expect(isReturnPathAllowed('/order/x')).toBe(true);
    expect(isReturnPathAllowed('/ury?a=b')).toBe(true);
  });

  it('isReturnPathAllowed rejects invalid paths', () => {
    expect(isReturnPathAllowed('')).toBe(false);
    expect(isReturnPathAllowed('ury/wastage')).toBe(false); // no leading slash
    expect(isReturnPathAllowed('//evil.example')).toBe(false); // protocol-relative
    expect(isReturnPathAllowed('/\\evil.example')).toBe(false); // backslash variant
    expect(isReturnPathAllowed('https://evil.example/ury')).toBe(false); // absolute URL
    expect(isReturnPathAllowed('javascript:alert(1)')).toBe(false); // javascript protocol
    expect(isReturnPathAllowed('/app/ury-issue-wastage')).toBe(false); // desk path, not app path
    expect(isReturnPathAllowed('/urydoesnotexist')).toBe(false); // prefix not followed by / or ?
    expect(isReturnPathAllowed(null as any)).toBe(false); // non-string
    expect(isReturnPathAllowed(undefined as any)).toBe(false); // non-string
    expect(isReturnPathAllowed(123 as any)).toBe(false); // non-string
    expect(isReturnPathAllowed('a'.repeat(513))).toBe(false); // longer than 512 chars
  });

  it('appLabelForPath returns correct labels for paths', () => {
    expect(appLabelForPath('/ury/wastage')).toBe('URY');
    expect(appLabelForPath('/pos/orders')).toBe('POS');
    expect(appLabelForPath('/mosaic')).toBe('Mosaic');
    expect(appLabelForPath('/ury/order/abc')).toBe('Self Ordering');
    expect(appLabelForPath('/ury/pos/x')).toBe('POS');
    expect(appLabelForPath('/unknown')).toBe('URY');
  });

  it('getCurrentReturnContext returns null when pathname is not an app path', () => {
    const mockLocation = {
      pathname: '/app/ury-issue-wastage',
      search: '',
    };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    const context = getCurrentReturnContext();
    expect(context).toBeNull();
  });

  it('getCurrentReturnContext returns the path with query string and correct label', () => {
    const mockLocation = {
      pathname: '/ury/wastage',
      search: '?dept=x',
    };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    const context = getCurrentReturnContext();
    expect(context).not.toBeNull();
    expect(context?.path).toBe('/ury/wastage?dept=x');
    expect(context?.label).toBe('URY');
  });

  it('getCurrentReturnContext restores properly after test', () => {
    const mockLocation = {
      pathname: '/pos/orders',
      search: '',
    };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    const context = getCurrentReturnContext();
    expect(context).not.toBeNull();
    expect(context?.label).toBe('POS');

    // Clean up
    delete (window as any).location;
  });
});
