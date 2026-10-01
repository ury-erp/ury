import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
}

// Exercise the real handlers without mounting an app or connecting to Frappe.
// Only framework, network and UI boundaries are replaced.
export function loadModule(file, globals, dependencies = {}) {
  let source = readFileSync(file, 'utf8');
  if (file.endsWith('.vue')) source = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const { outputText } = ts.transpileModule(source, {
    fileName: file.endsWith('.vue') ? 'component.js' : file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  const exports = {};
  const require = (name) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('.')) {
      const base = resolve(dirname(file), name);
      const path = [base, `${base}.ts`, `${base}.js`].find((path) => existsSync(path));
      if (path) return loadModule(path, globals, dependencies);
    }
    return {};
  };
  vm.runInNewContext(outputText, { exports, require, React: dependencies.react, ...globals }, { filename: file });
  return exports;
}

export function environment() {
  const calls = [];
  const errors = [];
  const localStorage = memoryStorage({
    userAuth: 'true', selectedRoom: 'Dining', posOrderTabsData: 'legacy carts',
    'posOrderTabsData:alice@example.com': 'Alice carts', kot_time: '08:00',
    'KOT-001_item-001_strike': 'true', deskPreference: 'keep',
    ury_device_credential: 'keep',
  });
  const sessionStorage = memoryStorage({ posProfile: 'cached', deskSession: 'keep' });
  const window = {
    csrf_token: 'session-token',
    frappe: { boot: { user: { name: 'alice@example.com' } } },
    location: { href: '/current', reload: () => calls.push(['reload']) },
  };
  const globals = {
    window, localStorage, sessionStorage,
    console: { error() {} },
    fetch: async (...args) => { calls.push(args); return { ok: true, status: 200 }; },
  };
  return { globals, calls, errors };
}

export function loadVueLogout(app, env) {
  const dependencies = {
    pinia: { defineStore: (_name, options) => options },
    axios: { defaults: {} },
    './frappeSdk.js': { __esModule: true, default: { url: '', db: () => ({}), call: () => ({}), auth: () => ({
      logout: () => env.globals.fetch('/api/method/logout', { method: 'POST' }),
    }) } },
    './Table.js': { useTableStore: () => ({}) },
    './Menu.js': { useMenuStore: () => ({}) },
    './invoiceData.js': { useInvoiceDataStore: () => ({}) },
    './Alert.js': { useAlert: () => ({ createAlert: (_title, message) => {
      env.errors.push(message); return Promise.resolve();
    } }) },
    '../router': { __esModule: true, default: { push: (path) => {
      env.calls.push(['router', path]); return Promise.resolve();
    } } },
    './utils/PrintWithQz': { disconnectQzPrinter() {} },
  };
  const file = app === 'urypos' ? 'urypos/src/stores/Auth.js' : 'mosaic/src/components/Header.vue';
  const module = loadModule(resolve(file), env.globals, dependencies);
  const options = app === 'urypos' ? module.useAuthStore : module.default;
  const instance = { ...(options.state ?? options.data)(), ...(options.actions ?? options.methods) };
  return { instance, run: () => (instance.logOut ?? instance.logout).call(instance) };
}
