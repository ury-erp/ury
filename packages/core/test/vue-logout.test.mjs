import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, loadVueLogout } from './logout-harness.mjs';

for (const app of ['urypos', 'mosaic']) {
  test(`${app}: logout POST includes the session CSRF token`, async () => {
    const env = environment();
    await loadVueLogout(app, env).run();
    assert.equal(env.calls[0][0], '/api/method/logout');
    assert.equal(env.calls[0][1].method, 'POST');
    assert.equal(env.calls[0][1].headers?.['X-Frappe-CSRF-Token'], 'session-token');
  });

  test(`${app}: successful logout clears URY state and goes to the common login`, async () => {
    const env = environment();
    await loadVueLogout(app, env).run();
    assert.equal(env.globals.window.location.href, '/login');
    for (const key of ['userAuth', 'selectedRoom', 'posOrderTabsData',
      'posOrderTabsData:alice@example.com', 'kot_time', 'KOT-001_item-001_strike']) {
      assert.equal(env.globals.localStorage.getItem(key), null, key);
    }
    assert.equal(env.globals.localStorage.getItem('deskPreference'), 'keep');
    assert.equal(env.globals.localStorage.getItem('ury_device_credential'), 'keep');
    assert.equal(env.globals.sessionStorage.getItem('posProfile'), null);
    assert.equal(env.globals.sessionStorage.getItem('deskSession'), 'keep');
    assert.equal(env.calls.some(([name]) => name === 'router' || name === 'reload'), false);
  });

  for (const failure of ['HTTP', 'network']) {
    test(`${app}: ${failure} failure preserves the session UI and displays an error`, async () => {
      const env = environment();
      env.globals.fetch = async () => {
        if (failure === 'network') throw new Error('Network unavailable');
        return { ok: false, status: 403 };
      };
      const { instance, run } = loadVueLogout(app, env);
      await run();
      assert.equal(env.globals.window.location.href, '/current');
      assert.equal(env.globals.localStorage.getItem('userAuth'), 'true');
      assert.equal(env.globals.sessionStorage.getItem('posProfile'), 'cached');
      assert.ok(instance.logoutError || env.errors[0], 'visible failure feedback');
      assert.equal(instance.loggingOut, false);
    });
  }

  test(`${app}: pending logout blocks duplicate requests and keeps storage until success`, async () => {
    const env = environment();
    let complete;
    env.globals.fetch = (...args) => {
      env.calls.push(args);
      return new Promise((resolve) => { complete = resolve; });
    };
    const { instance, run } = loadVueLogout(app, env);
    const first = run();
    const second = run();
    const pending = instance.loggingOut;
    const requests = env.calls.length;
    const stored = env.globals.localStorage.getItem('userAuth');
    complete({ ok: true, status: 200 });
    // Don't await the second unresolved request in the broken implementation.
    if (requests === 1) await Promise.all([first, second]);
    assert.equal(pending, true);
    assert.equal(requests, 1);
    assert.equal(stored, 'true');
  });
}
