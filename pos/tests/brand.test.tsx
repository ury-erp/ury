import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Header from '../src/components/Header';
import { initI18n } from '../src/i18n';

vi.mock('../src/store/root-store', () => ({ useRootStore: (selector?: Function) => {
  const store = { user: null, orderSearchQuery: '', setOrderSearchQuery: vi.fn() };
  return selector ? selector(store) : store;
} }));
vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({ searchQuery: '', setSearchQuery: vi.fn() }) }));

const defaults = { name: 'URY POS', logo: '/assets/ury/pos/ury_pos.png', favicon: '/ury.ico' };
const site = { name: 'Cafe\\Diner "</script>', logo: '/files/site-logo.png', favicon: '/files/site.ico' };
const browser = window as Window & { frappe?: { boot?: { ury_brand?: unknown; app_logo_url?: string } } };

async function resolver() {
  expect(existsSync(resolve('packages/core/src/brand.ts')), 'Shared Website Settings brand resolver is missing').toBe(true);
  const modulePath = '../../packages/core/src/brand';
  return (await import(/* @vite-ignore */ modulePath)).resolveBrand;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  browser.frappe = { boot: {} };
  await initI18n('en');
});
afterEach(() => { delete browser.frappe; vi.unstubAllGlobals(); });

describe('Website Settings brand resolution', () => {
  it('uses all three site fields, including a backslash in the name', async () => {
    browser.frappe!.boot!.ury_brand = site;
    expect((await resolver())(defaults)).toEqual(site);
  });
  it.each([undefined, null, {}])('keeps URY defaults for unset branding %j, ignoring Frappe logo', async (brand) => {
    browser.frappe = { boot: { ury_brand: brand, app_logo_url: '/assets/frappe/logo.svg' } };
    expect((await resolver())(defaults)).toEqual(defaults);
  });
  it('falls back per field without mutating the defaults or boot', async () => {
    const partial = Object.freeze({ name: null, logo: '/files/tenant.png', favicon: '' });
    browser.frappe!.boot!.ury_brand = partial;
    expect((await resolver())(Object.freeze({ ...defaults }))).toEqual({ ...defaults, logo: '/files/tenant.png' });
  });
  it('keeps defaults when there is no browser boot', async () => {
    const resolveBrand = await resolver();
    vi.stubGlobal('window', undefined);
    expect(resolveBrand(defaults)).toEqual(defaults);
  });
});

describe('POS Header site identity', () => {
  it.each([site, null])('renders the configured logo and alt or the existing URY defaults: %j', async (brand) => {
    browser.frappe!.boot!.ury_brand = brand;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<MemoryRouter><Header /></MemoryRouter>));
      const logo = container.querySelector('header img')!;
      expect(logo.getAttribute('src')).toBe(brand?.logo ?? defaults.logo);
      expect(logo.getAttribute('alt')).toBe(brand?.name ?? defaults.name);
      expect(container.querySelector('script')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
