import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { initI18n } from '../src/i18n';
import Header from '../src/components/Header';
import Footer from '../src/components/Footer';
import App from '../src/App';

const state = vi.hoisted(() => ({ user: null as null | { name: string; roles: string[] } }));
vi.mock('../src/store/root-store', () => ({ useRootStore: (selector?: Function) => {
  const store = { user: state.user, orderSearchQuery: '', setOrderSearchQuery: vi.fn() };
  return selector ? selector(store) : store;
} }));
vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({ initializeApp: vi.fn() }) }));
// Only outer providers/pages are replaced; routes and both navigation components are real.
vi.mock('../src/components/ScreenSizeProvider', () => ({ default: ({ children }: any) => children }));
vi.mock('../src/components/POSOpeningProvider', () => ({ default: ({ children }: any) => children }));
vi.mock('../src/components/AuthGuard', () => ({ default: ({ children }: any) => children }));
vi.mock('../src/components/KotAlertListener', () => ({ default: () => null }));
vi.mock('../src/pages/Orders', () => ({ default: () => createElement('div', {}, 'Settlement page') }));
vi.mock('../src/pages/Dashboard', () => ({ default: () => createElement('div', {}, 'Analytics page') }));
vi.mock('../src/pages/POS', () => ({ default: () => null }));
vi.mock('../src/pages/Table', () => ({ default: () => null }));
vi.mock('../src/pages/Settings', () => ({ default: () => null }));
vi.mock('../src/captain/pages/CaptainTables', () => ({ default: () => null }));
vi.mock('../src/captain/pages/CaptainOrder', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await initI18n('en');
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe.each([
  [{ name: 'cashier', roles: ['URY Cashier'] }, '/orders'],
  [{ name: 'multi', roles: ['System Manager', 'URY Cashier'] }, '/orders'],
  [{ name: 'manager', roles: ['URY Manager'] }, '/dashboard'],
  [{ name: 'Administrator', roles: ['System Manager'] }, '/dashboard'],
  [{ name: 'Administrator', roles: ['System Manager', 'URY Cashier'] }, '/orders'],
  [null, '/dashboard'],
])('Home for %j', (user, path) => {
  beforeEach(() => { state.user = user as typeof state.user; });
  it('resolves the role-aware home helper', async () => {
    // Assert missing behavior explicitly instead of treating a missing-module error as RED.
    const file = resolve('pos/src/lib/home-route.ts');
    expect(existsSync(file), 'The role-aware Home helper must exist').toBe(true);
    const modulePath = '../src/lib/home-route';
    const { homePath } = await import(/* @vite-ignore */ modulePath);
    expect(homePath(user)).toBe(path);
  });
  it('routes the header logo to Home', async () => {
    await act(async () => root.render(createElement(MemoryRouter, {}, createElement(Header))));
    expect(container.querySelector('img[alt="URY POS"]')?.closest('a')?.getAttribute('href')).toBe(path);
  });
  it('routes Dashboard to Home and preserves an explicit analytics/history destination', async () => {
    await act(async () => root.render(createElement(MemoryRouter, {}, createElement(Footer))));
    const links = Array.from(container.querySelectorAll('a'));
    expect(links[0].textContent).toBe('Dashboard');
    expect(links[0].getAttribute('href')).toBe(path);
    expect(links[3].textContent).toBe(path === '/orders' ? 'Analytics' : 'Orders');
    expect(links[3].getAttribute('href')).toBe(path === '/orders' ? '/dashboard' : '/orders');
  });
  it('redirects /pos/ to the same Home', async () => {
    window.history.replaceState({}, '', '/pos/');
    await act(async () => root.render(createElement(App)));
    expect(window.location.pathname).toBe(`/pos${path}`);
    expect(container.textContent).toContain(path === '/orders' ? 'Settlement page' : 'Analytics page');
  });
});
