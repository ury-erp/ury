import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { environment, loadModule } from '../../packages/core/test/logout-harness.mjs';

function header(env: ReturnType<typeof environment>) {
  let state: unknown[] = [true];
  let index = 0;
  const react = {
    useState(initial: unknown) {
      const slot = index++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], (value: unknown) => { state[slot] = value; }];
    },
    useRef() {
      const slot = index++;
      if (!(slot in state)) state[slot] = { current: null };
      return state[slot];
    },
    useEffect() {},
    createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props, children }),
  };
  const ui = { Button: 'button', Input: 'input', showToast: {
    error: (message: string) => env.errors.push(message),
  } };
  // Use the real core implementation (the Frappe SDK is a network boundary).
  const auth = loadModule(resolve('packages/core/src/frappe/auth.ts'), env.globals, {
    './client': { auth: { logout: () => env.globals.fetch('/api/method/logout', { method: 'POST' }) } },
  });
  const core = loadModule(resolve('packages/core/src/index.ts'), env.globals, {
    './frappe/client': {}, './frappe/auth': auth, './frappe/roles': {},
    './frappe/errors': {}, './types': {}, './format': {}, './print/qz': {},
    './utils/validateField': {},
  });
  const store = { user: { name: 'alice@example.com' }, searchQuery: '', orderSearchQuery: '' };
  const Header = loadModule(resolve('pos/src/components/Header.tsx'), env.globals, {
    react, '@ury/ui': ui, '@ury/core': core,
    '../i18n': { t: (key: string) => key },
    'react-router-dom': { Link: 'a', useLocation: () => ({ pathname: '/dashboard' }) },
    '../store/root-store': { useRootStore: (select?: any) => select ? select(store) : store },
    '../store/pos-store': { usePOSStore: () => store },
  }).default;
  return () => {
    index = 0;
    const buttons: any[] = [];
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'button') buttons.push(node);
      node.children?.flat(Infinity).forEach(visit);
    };
    visit(Header());
    return (label: string) => buttons.find((button) => button.children.includes(label));
  };
}

test('POS: logout includes CSRF, clears only URY state and goes to /login', async () => {
  const env = environment();
  await header(env)()('header.logout').props.onClick();
  assert.equal(env.calls[0][1].headers?.['X-Frappe-CSRF-Token'], 'session-token');
  assert.equal(env.globals.window.location.href, '/login');
  assert.equal(env.globals.localStorage.getItem('posOrderTabsData'), null);
  assert.equal(env.globals.sessionStorage.getItem('posProfile'), null);
  assert.equal(env.globals.localStorage.getItem('deskPreference'), 'keep');
});

test('POS: rejected HTTP logout stays on the page with a visible error', async () => {
  const env = environment();
  env.globals.fetch = async () => ({ ok: false, status: 403 });
  await header(env)()('header.logout').props.onClick();
  assert.equal(env.globals.window.location.href, '/current');
  assert.ok(env.errors[0]);
  assert.equal(env.globals.localStorage.getItem('posOrderTabsData'), 'legacy carts');
});

test('POS: pending logout disables its button and sends only one request', async () => {
  const env = environment();
  let complete: (value: unknown) => void;
  env.globals.fetch = (...args: unknown[]) => {
    env.calls.push(args);
    return new Promise((resolve) => { complete = resolve; });
  };
  const render = header(env);
  const click = render()('header.logout').props.onClick;
  const first = click();
  const second = click();
  const disabled = render()('header.logout').props.disabled;
  const requests = env.calls.length;
  complete!({ ok: true, status: 200 });
  if (requests === 1) await Promise.all([first, second]);
  assert.equal(disabled, true);
  assert.equal(requests, 1);
});

test('POS: Clear Cache preserves Desk storage and self-ordering credentials', () => {
  const env = environment();
  header(env)()('header.clear_cache').props.onClick();
  assert.equal(env.globals.localStorage.getItem('deskPreference'), 'keep');
  assert.equal(env.globals.localStorage.getItem('ury_device_credential'), 'keep');
  assert.equal(env.globals.sessionStorage.getItem('deskSession'), 'keep');
  assert.equal(env.globals.localStorage.getItem('posOrderTabsData'), null);
  assert.equal(env.globals.sessionStorage.getItem('posProfile'), null);
});
