import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { environment, loadModule } from '../../packages/core/test/logout-harness.mjs';

function header(env) {
  const state = [false, true]; // Open the user menu, not the notifications drawer.
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], (value) => { state[slot] = value; }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in state)) state[slot] = { current: initial };
      return state[slot];
    },
    useEffect() {},
    useCallback: (callback) => callback,
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  // Keep the real core logout and storage behavior; replace only the SDK network boundary.
  const auth = loadModule(resolve('packages/core/src/frappe/auth.ts'), env.globals, {
    './client': { auth: { logout: () => env.globals.fetch('/api/method/logout', { method: 'POST' }) } },
  });
  const core = loadModule(resolve('packages/core/src/index.ts'), env.globals, {
    './frappe/client': {}, './frappe/auth': auth, './frappe/roles': {},
    './frappe/errors': {}, './types': {}, './format': {}, './print/qz': {},
    './utils/validateField': {},
  });
  const Header = loadModule(resolve('frontend/src/components/layout/Header.tsx'), env.globals, {
    react, '@ury/core': core,
    '@ury/ui': { showToast: { error: (message) => env.errors.push(message) } },
    'react-router-dom': { Link: 'a', useNavigate: () => () => {} },
    '../../context/BranchContext': { useBranchContext: () => ({ branches: [] }) },
  }).Header;
  const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).flat(Infinity).map(text).join('');
  return () => {
    index = 0;
    const buttons = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'button') buttons.push(node);
      node.children?.flat(Infinity).forEach(visit);
    };
    visit(Header());
    return (label) => buttons.find((button) => text(button) === label);
  };
}

test('URY: logout POST includes the session CSRF token', async () => {
  const env = environment();
  await header(env)()('Logout').props.onClick();
  assert.equal(env.calls[0][0], '/api/method/logout');
  assert.equal(env.calls[0][1].method, 'POST');
  assert.equal(env.calls[0][1].headers?.['X-Frappe-CSRF-Token'], 'session-token');
});

test('URY: successful logout lands on the common login without an app redirect', async () => {
  const env = environment();
  await header(env)()('Logout').props.onClick();
  assert.equal(env.globals.window.location.href, '/login');
});

test('URY: successful logout stays disabled and blocks requests while navigating', async () => {
  const env = environment();
  const render = header(env);
  await render()('Logout').props.onClick();
  const button = render()('Logout');
  const disabled = button.props.disabled;
  await button.props.onClick();
  assert.equal(disabled, true);
  assert.equal(env.calls.length, 1);
  assert.equal(env.globals.window.location.href, '/login');
});

for (const action of ['Logout', 'Clear Cache']) {
  for (const [storage, key] of [
    ['sessionStorage', 'ury.setup.configureState'],
    ['localStorage', 'ury_active_branch_id'],
  ]) {
    test(`URY: ${action} removes ${key} before another user inherits it`, async () => {
      const env = environment();
      await header(env)()(action).props.onClick();
      assert.equal(env.globals[storage].getItem(key), null, key);
    });
  }

  test(`URY: ${action} preserves the language preference`, async () => {
    const env = environment();
    await header(env)()(action).props.onClick();
    assert.equal(env.globals.localStorage.getItem('ury_language'), 'fr');
  });
}

test('URY: successful logout removes session carts but preserves unrelated storage', async () => {
  const env = environment();
  env.globals.localStorage.setItem('posOrderTabsData:bob@example.com', 'Bob carts');
  await header(env)()('Logout').props.onClick();
  for (const key of ['selectedRoom', 'posOrderTabsData',
    'posOrderTabsData:alice@example.com', 'posOrderTabsData:bob@example.com']) {
    assert.equal(env.globals.localStorage.getItem(key), null, key);
  }
  assert.equal(env.globals.localStorage.getItem('deskPreference'), 'keep');
  assert.equal(env.globals.localStorage.getItem('ury_device_credential'), 'keep');
  assert.equal(env.globals.sessionStorage.getItem('deskSession'), 'keep');
});

for (const failure of ['HTTP', 'network']) {
  test(`URY: ${failure} logout failure preserves session state and reports an error`, async () => {
    const env = environment();
    env.globals.fetch = async () => {
      if (failure === 'network') throw new Error('Network unavailable');
      return { ok: false, status: 403 };
    };
    const render = header(env);
    await render()('Logout').props.onClick();
    assert.equal(env.globals.window.location.href, '/current');
    assert.equal(env.globals.localStorage.getItem('selectedRoom'), 'Dining');
    assert.equal(env.globals.localStorage.getItem('posOrderTabsData:alice@example.com'), 'Alice carts');
    assert.equal(env.globals.sessionStorage.getItem('posProfile'), 'cached');
    assert.ok(env.errors[0], 'visible failure feedback');
    assert.equal(Boolean(render()('Logout').props.disabled), false);
  });
}

test('URY: pending logout disables its button, retains carts and sends one request', async () => {
  const env = environment();
  const completions = [];
  env.globals.fetch = (...args) => {
    env.calls.push(args);
    return new Promise((resolve) => { completions.push(resolve); });
  };
  const render = header(env);
  const click = render()('Logout').props.onClick;
  const first = click();
  const second = click();
  const disabled = render()('Logout').props.disabled;
  const requests = env.calls.length;
  const stored = env.globals.localStorage.getItem('selectedRoom');
  const location = env.globals.window.location.href;
  completions.forEach((complete) => complete({ ok: true, status: 200 }));
  await Promise.all([first, second]);
  assert.equal(disabled, true);
  assert.equal(requests, 1);
  assert.equal(stored, 'Dining');
  assert.equal(location, '/current');
});

test('URY: Clear Cache removes session carts and reloads without erasing other apps', () => {
  const env = environment();
  header(env)()('Clear Cache').props.onClick();
  assert.equal(env.globals.localStorage.getItem('selectedRoom'), null);
  assert.equal(env.globals.localStorage.getItem('posOrderTabsData:alice@example.com'), null);
  assert.equal(env.globals.sessionStorage.getItem('posProfile'), null);
  assert.equal(env.globals.localStorage.getItem('deskPreference'), 'keep');
  assert.equal(env.globals.localStorage.getItem('ury_device_credential'), 'keep');
  assert.equal(env.globals.sessionStorage.getItem('deskSession'), 'keep');
  assert.deepEqual(env.calls, [['reload']]);
});
