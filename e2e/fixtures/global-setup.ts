import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Idempotent REST-driven fixture setup, run once before the suite.
 *
 * Ensures (against the live bench at URY_BASE_URL, as Administrator):
 *  - An e2e captain/cashier user, with the `URY Captain` + `URY Cashier`
 *    roles, mapped onto a Branch via a `URY User` child row (the exact
 *    real gap documented in e2e/README.md's round-2 finding).
 *  - That Branch's POS Profile has an open (submitted, status "Open")
 *    POS Opening Entry — creating + submitting one if none is open.
 *  - A uniquely named, priced menu Item (fixes the "two Items both named
 *    Appam" seed smell called out in the audit) with an Item Price row
 *    on the POS Profile's selling price list.
 *  - A correct per-user "Company" default for the captain user. Real bug
 *    found while wiring this up: `ury.ury_pos.api.get_pos_opening_screen_data`
 *    resolves the acting user's company via
 *    `frappe.defaults.get_user_default("Company")`, falling back to
 *    `frappe.db.get_default("Company")` (the site-wide global default,
 *    stored under `tabDefaultValue` with `defkey='company'`, lowercase)
 *    when no user-specific default exists. That global default on this
 *    bench is the stock demo company `_Test Company`, not the seeded
 *    `Test Company` the E2E Branch's POS Profile actually belongs to —
 *    so without a correct per-user override, `_get_allowed_pos_profiles()`
 *    filters by the wrong company and returns zero allowed profiles,
 *    which renders as a permanently disabled "Open POS Session" screen
 *    ("No POS Profile is available for your user in this branch") that
 *    blocks the captain from ever reaching `/pos/order`. Setting the
 *    override itself only takes effect with the *lowercase* `defkey`
 *    (`company`, not `Company` — Frappe's own global row uses lowercase,
 *    and a capitalised user-specific row is silently ignored by the
 *    lookup) — this was found empirically by comparing raw
 *    `tabDefaultValue` rows, not guessed.
 *  - All tables on that Branch are Free: any Draft (docstatus 0) POS
 *    Invoice left occupying a table by a prior run is deleted (its linked
 *    URY KOTs are cleaned up by the app's own POS Invoice on_trash hook),
 *    so re-running the suite never runs out of Free tables.
 *
 * Resolved names are cached to e2e/.cache/fixtures.json (gitignored) so
 * repeat runs — and the spec file itself — can reuse them without
 * re-deriving anything, but this file always re-verifies each cached
 * name against the live bench before trusting it.
 */

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'fixtures.json');

interface Fixtures {
  baseURL: string;
  branch: string;
  posProfile: string;
  company: string;
  captainUser: string;
  captainPassword: string;
  menuItem: { item: string; itemName: string; rate: number };
  modeOfPayment: string;
  customerName: string;
}

function readEnvLocal(): Record<string, string> {
  const envPath = path.join(ROOT, '.env.local');
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function randomPassword(): string {
  return Buffer.from(
    Array.from({ length: 24 }, () => Math.floor(Math.random() * 256))
  ).toString('base64url');
}

class Bench {
  private cookie = '';
  constructor(private baseURL: string) {}

  async login(usr: string, pwd: string) {
    const res = await fetch(`${this.baseURL}/api/method/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `usr=${encodeURIComponent(usr)}&pwd=${encodeURIComponent(pwd)}`,
    });
    if (!res.ok) throw new Error(`login failed for ${usr}: ${res.status} ${await res.text()}`);
    const setCookie = res.headers.get('set-cookie') || '';
    this.cookie = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(';')[0].trim())
      .join('; ');
  }

  private async request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.baseURL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.cookie,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON response
    }
    return { ok: res.ok, status: res.status, json, text };
  }

  async get(path: string) {
    return this.request('GET', path);
  }
  async post(path: string, body?: unknown) {
    return this.request('POST', path, body);
  }
  async put(path: string, body?: unknown) {
    return this.request('PUT', path, body);
  }
  async del(path: string) {
    return this.request('DELETE', path);
  }

  async getList<T = any>(doctype: string, filters: unknown[], fields: string[]): Promise<T[]> {
    const qs = new URLSearchParams({
      doctype,
      filters: JSON.stringify(filters),
      fields: JSON.stringify(fields),
      limit_page_length: '0',
    });
    const res = await this.get(`/api/method/frappe.client.get_list?${qs.toString()}`);
    if (!res.ok) throw new Error(`get_list ${doctype} failed: ${res.status} ${res.text}`);
    return res.json?.message ?? [];
  }

  async getDoc(doctype: string, name: string) {
    const res = await this.get(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    return res.json?.data ?? null;
  }

  async exists(doctype: string, name: string) {
    return (await this.getDoc(doctype, name)) !== null;
  }

  async insert(doctype: string, doc: Record<string, unknown>) {
    const res = await this.post(`/api/resource/${encodeURIComponent(doctype)}`, doc);
    if (!res.ok) throw new Error(`insert ${doctype} failed: ${res.status} ${res.text}`);
    return res.json.data;
  }

  async update(doctype: string, name: string, doc: Record<string, unknown>) {
    const res = await this.put(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, doc);
    if (!res.ok) throw new Error(`update ${doctype}/${name} failed: ${res.status} ${res.text}`);
    return res.json.data;
  }

  async delete(doctype: string, name: string) {
    const res = await this.del(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
    if (!res.ok && res.status !== 404) {
      throw new Error(`delete ${doctype}/${name} failed: ${res.status} ${res.text}`);
    }
  }

  async callMethod(method: string, args: Record<string, unknown>) {
    const res = await this.post(`/api/method/${method}`, args);
    if (!res.ok) throw new Error(`${method} failed: ${res.status} ${res.text}`);
    return res.json;
  }
}

async function ensureBranchAndCompany(bench: Bench, branch: string, company: string) {
  if (!(await bench.exists('Company', company))) {
    throw new Error(
      `Expected Company "${company}" to already exist on this bench (seeded via ury.ury.dev_seed.demo_runner.seed_all) — not creating one from e2e global-setup.`
    );
  }
  if (!(await bench.exists('Branch', branch))) {
    await bench.insert('Branch', { doctype: 'Branch', branch });
  }
}

async function ensureCaptainUser(bench: Bench, branch: string, cached?: Fixtures | null) {
  const email = cached?.captainUser ?? 'e2e.captain@example.test';
  let password = cached?.captainPassword ?? randomPassword();

  const existing = await bench.getDoc('User', email);
  if (!existing) {
    await bench.insert('User', {
      doctype: 'User',
      email,
      first_name: 'E2E',
      last_name: 'Captain',
      send_welcome_email: 0,
      new_password: password,
      roles: [{ role: 'URY Captain' }, { role: 'URY Cashier' }],
    });
  } else {
    const roles = new Set((existing.roles ?? []).map((r: any) => r.role));
    const missing = ['URY Captain', 'URY Cashier'].filter((r) => !roles.has(r));
    if (missing.length) {
      await bench.update('User', email, {
        roles: [...(existing.roles ?? []), ...missing.map((role) => ({ role }))],
      });
    }
    if (existing.enabled === 0) {
      await bench.update('User', email, { enabled: 1 });
    }
    if (!cached?.captainPassword) {
      await bench.callMethod('frappe.client.set_value', {
        doctype: 'User',
        name: email,
        fieldname: 'new_password',
        value: password,
      });
    } else {
      password = cached.captainPassword;
    }
  }

  // URY User branch mapping — the real root-caused gap from the README's
  // round-2 finding (getBranch() throws "not Associated with any Branch"
  // without this row).
  const branchDoc = await bench.getDoc('Branch', branch);
  const rows: Array<{ user: string }> = branchDoc?.user ?? [];
  if (!rows.some((r) => r.user === email)) {
    await bench.update('Branch', branch, {
      user: [...rows, { user: email }],
    });
  }

  return { email, password };
}

/**
 * Ensures the captain user's per-user "Company" default resolves to the
 * given company. See the module doc-comment above for the real root cause
 * this works around (lowercase `defkey`, plus the site-wide `_Test Company`
 * global default this bench ships with).
 *
 * Idempotent via a functional probe rather than a doctype list query: REST
 * list access to `DefaultValue` is blocked for non-parent-scoped queries
 * (`frappe.model.db_query.check_parent_permission`), so this logs in as the
 * captain user itself and asks the app's own `get_pos_opening_screen_data`
 * whether the resolved company already matches — inserting a corrective
 * `DefaultValue` row only when it doesn't.
 */
async function ensureUserCompanyDefault(baseURL: string, email: string, password: string, company: string, adminBench: Bench) {
  const asCaptain = new Bench(baseURL);
  await asCaptain.login(email, password);
  const probe = await asCaptain.callMethod('ury.ury_pos.api.get_pos_opening_screen_data', {});
  if (probe?.message?.company === company) return;

  await adminBench.insert('DefaultValue', {
    doctype: 'DefaultValue',
    parent: email,
    parenttype: '__default',
    parentfield: '',
    // Lowercase is load-bearing — see module doc-comment.
    defkey: 'company',
    defvalue: company,
  });
}

async function ensurePosProfileOpen(bench: Bench, branch: string, posProfile: string, cashier: string) {
  // get_pos_opening_screen_data's own "open_entries" check (ury_pos/api.py)
  // is scoped to `user = frappe.session.user` — an Open entry belonging to
  // Administrator (or any other user) does not satisfy this for the
  // captain, so the query below must filter by the acting cashier too, not
  // just the POS Profile.
  const openEntries = await bench.getList<{ name: string }>(
    'POS Opening Entry',
    [
      ['pos_profile', '=', posProfile],
      ['user', '=', cashier],
      ['status', '=', 'Open'],
      ['docstatus', '=', 1],
    ],
    ['name']
  );
  if (openEntries.length > 0) return openEntries[0].name;

  const profile = await bench.getDoc('POS Profile', posProfile);
  if (!profile) throw new Error(`POS Profile "${posProfile}" does not exist — expected from seed_all.`);

  const balanceDetails = (profile.payments ?? []).map((p: any) => ({
    mode_of_payment: p.mode_of_payment,
    opening_amount: 0,
  }));

  const doc = await bench.insert('POS Opening Entry', {
    doctype: 'POS Opening Entry',
    company: profile.company,
    pos_profile: posProfile,
    branch,
    user: cashier,
    period_start_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    balance_details: balanceDetails,
  });

  await bench.callMethod('frappe.client.submit', { doc: JSON.stringify({ ...doc, doctype: 'POS Opening Entry' }) });
  return doc.name;
}

async function ensureMenuItem(bench: Bench, posProfile: string): Promise<{ item: string; itemName: string; rate: number }> {
  const itemCode = 'E2E Captain Test Item';
  const rate = 199;

  // Item Group is load-bearing, not cosmetic: KOT generation
  // (ury/ury/api/ury_kot_routing.py's resolve_production_units) requires
  // either an exact per-item `URY Item Production Configuration` mapping or
  // a legacy `URY Production Item Groups` match on the branch's production
  // units before it will route an item to a kitchen station at all. A
  // generic "Products" group has no such mapping on this bench and makes
  // every sync_order that includes the item fail with a real
  // `RoutingError` ("no exact mapping and no legacy Item Group match
  // found") — found empirically by calling sync_order directly, not
  // guessed. "Main Course" is mapped to the E2E Branch's "Indian Kitchen"
  // production unit (seeded via `URY Production Item Groups`), so reuse
  // that instead of inventing an unroutable group.
  const itemGroup = 'Main Course';
  if (!(await bench.exists('Item', itemCode))) {
    await bench.insert('Item', {
      doctype: 'Item',
      item_code: itemCode,
      item_name: itemCode,
      item_group: itemGroup,
      is_stock_item: 0,
      stock_uom: 'Nos',
    });
  } else {
    const existingItem = await bench.getDoc('Item', itemCode);
    if (existingItem?.item_group !== itemGroup) {
      await bench.update('Item', itemCode, { item_group: itemGroup });
    }
  }

  const profile = await bench.getDoc('POS Profile', posProfile);
  const priceList = profile?.selling_price_list ?? 'Standard Selling';

  const prices = await bench.getList<{ name: string; price_list_rate: number }>(
    'Item Price',
    [
      ['item_code', '=', itemCode],
      ['price_list', '=', priceList],
    ],
    ['name', 'price_list_rate']
  );
  if (prices.length === 0) {
    await bench.insert('Item Price', {
      doctype: 'Item Price',
      item_code: itemCode,
      price_list: priceList,
      price_list_rate: rate,
      currency: profile?.currency ?? 'INR',
    });
  } else if (Number(prices[0].price_list_rate) !== rate) {
    await bench.update('Item Price', prices[0].name, { price_list_rate: rate });
  }

  return { item: itemCode, itemName: itemCode, rate };
}

async function freeAllTables(bench: Bench, branch: string) {
  const tables = await bench.getList<{ name: string }>('URY Table', [['branch', '=', branch]], ['name']);
  const tableNames = tables.map((t) => t.name);
  if (tableNames.length === 0) return;

  const drafts = await bench.getList<{ name: string }>(
    'POS Invoice',
    [
      ['restaurant_table', 'in', tableNames],
      ['docstatus', '=', 0],
    ],
    ['name']
  );
  for (const draft of drafts) {
    // POS Invoice's own on_trash hook (ury/ury/hooks/ury_pos_invoice.py)
    // cleans up any linked URY KOT rows — deleting the draft invoice is
    // what actually frees the table (occupancy is derived from a live
    // Draft invoice's restaurant_table, not a stored status field).
    await bench.delete('POS Invoice', draft.name);
  }
}

async function ensureCustomer(bench: Bench, name: string) {
  if (await bench.exists('Customer', name)) return name;
  const doc = await bench.insert('Customer', {
    doctype: 'Customer',
    customer_name: name,
    customer_type: 'Individual',
  });
  return doc.name as string;
}

export default async function globalSetup(config: FullConfig) {
  const env = readEnvLocal();
  const baseURL =
    process.env.URY_BASE_URL || env.URY_BASE_URL || (config.projects[0]?.use?.baseURL as string) || 'http://localhost:8102';
  const adminUser = process.env.URY_E2E_ADMIN_USER || env.URY_E2E_ADMIN_USER || 'Administrator';
  const adminPassword = process.env.URY_E2E_ADMIN_PASSWORD || env.URY_E2E_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('URY_E2E_ADMIN_PASSWORD is not set — read/create e2e/.env.local before running the suite.');
  }

  let cached: Fixtures | null = null;
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      cached = null;
    }
  }

  const branch = cached?.branch ?? 'E2E Branch';
  const posProfile = cached?.posProfile ?? branch;
  const company = cached?.company ?? 'Test Company';

  const bench = new Bench(baseURL);
  await bench.login(adminUser, adminPassword);

  await ensureBranchAndCompany(bench, branch, company);
  const { email: captainUser, password: captainPassword } = await ensureCaptainUser(bench, branch, cached);
  await ensureUserCompanyDefault(baseURL, captainUser, captainPassword, company, bench);
  await ensurePosProfileOpen(bench, branch, posProfile, captainUser);
  const menuItem = await ensureMenuItem(bench, posProfile);
  const customerName = await ensureCustomer(bench, cached?.customerName ?? 'Rahul Sharma');
  await freeAllTables(bench, branch);

  const modeOfPayment = cached?.modeOfPayment ?? 'Cash';

  const fixtures: Fixtures = {
    baseURL,
    branch,
    posProfile,
    company,
    captainUser,
    captainPassword,
    menuItem,
    modeOfPayment,
    customerName,
  };

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(fixtures, null, 2));
}
