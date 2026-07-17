/**
 * MSW API integration tests for Vitest (Node environment).
 *
 * Verifies that MSW handlers correctly intercept Frappe SDK HTTP requests
 * and return the expected mock data.
 *
 * The MSW server runs via setupServer (no same-origin restriction in Node).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './server';
import { invalidateCache } from '../lib/api-dedup';

const BASE = 'http://localhost:8000';

async function apiGet(method: string, params?: Record<string, string>) {
  const url = new URL(`/api/method/${method}`, BASE);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(method: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function resourceGet(doctype: string, docname?: string, params?: Record<string, string>) {
  const encoded = encodeURIComponent(doctype);
  const path = docname ? `/api/resource/${encoded}/${encodeURIComponent(docname)}` : `/api/resource/${encoded}`;
  const url = new URL(path, BASE);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

beforeEach(() => { invalidateCache(); });

describe('MSW Auth handlers', () => {
  it('should return logged-in user', async () => {
    const data = await apiGet('frappe.auth.get_logged_user');
    expect(data.message).toBe('Administrator');
  });
  it('should handle logout', async () => {
    const data = await apiPost('logout');
    expect(data.message).toBe('Logged out');
  });
});

describe('MSW User resource', () => {
  it('should get a User doc', async () => {
    const data = await resourceGet('User', 'Administrator');
    expect(data.data.name).toBe('Administrator');
    expect(data.data.roles.length).toBeGreaterThan(0);
  });
});

describe('MSW Room resource', () => {
  it('should return rooms', async () => {
    const data = await resourceGet('URY Room');
    expect(data.data.length).toBeGreaterThan(0);
  });
  it('should filter rooms by branch', async () => {
    const data = await resourceGet('URY Room', undefined, { filters: JSON.stringify([['branch', 'like', 'Main Branch']]) });
    data.data.forEach((r: { branch: string }) => expect(r.branch).toContain('Main Branch'));
  });
});

describe('MSW Table resource', () => {
  it('should return tables for a room', async () => {
    const data = await resourceGet('URY Table', undefined, { filters: JSON.stringify([['restaurant_room', '=', 'Main Hall']]) });
    expect(data.data.length).toBeGreaterThan(0);
  });
  it('should return table count', async () => {
    const data = await resourceGet('URY Table', undefined, { fields: JSON.stringify(['count(name) as count']), limit: '1' });
    expect(data.data[0]).toHaveProperty('count');
  });
});

describe('MSW POS Profile resource', () => {
  it('should get POS Profile doc', async () => {
    const data = await resourceGet('POS Profile', 'Main POS');
    expect(data.data.name).toBe('Main POS');
  });
});

describe('MSW Menu handlers', () => {
  it('should return restaurant menu', async () => {
    const data = await apiGet('ury.ury_pos.api.getRestaurantMenu', { pos_profile: 'Main POS' });
    expect(data.message.items.length).toBeGreaterThan(0);
  });
  it('should return menu courses', async () => {
    const data = await apiGet('ury.ury_pos.api.getMenuCourses');
    expect(data.message.length).toBeGreaterThan(0);
  });
});

describe('MSW Payment handlers', () => {
  it('should return payment modes', async () => {
    const data = await apiGet('ury.ury_pos.api.getModeOfPayment');
    expect(data.message.length).toBeGreaterThan(0);
  });
});

describe('MSW Order handlers', () => {
  it('should return order for occupied table', async () => {
    const data = await apiGet('ury.ury.doctype.ury_order.ury_order.get_order_invoice', { table: 'T-002' });
    expect(data.message).not.toBeNull();
    expect(data.message.items.length).toBeGreaterThan(0);
  });
  it('should return null for free table', async () => {
    const data = await apiGet('ury.ury.doctype.ury_order.ury_order.get_order_invoice', { table: 'T-001' });
    expect(data.message).toBeNull();
  });
});

describe('MSW Dashboard handlers', () => {
  it('should return dashboard summary', async () => {
    const data = await apiGet('ury.ury.api.ury_dashboard.get_dashboard_summary', { period: 'today' });
    expect(data.message.total_revenue).toBeDefined();
  });
  it('should return revenue chart', async () => {
    const data = await apiGet('ury.ury.api.ury_dashboard.get_revenue_chart', { period: 'this_week' });
    expect(data.message.labels.length).toBeGreaterThan(0);
  });
  it('should return live metrics', async () => {
    const data = await apiGet('ury.ury.api.ury_dashboard.get_live_metrics');
    expect(data.message.active_orders).toBeDefined();
  });
});

describe('MSW Reports handlers', () => {
  it('should return sales report', async () => {
    const data = await apiGet('ury.ury.api.ury_reports.get_sales_report', { period: 'last_7_days' });
    expect(data.message.total_sales).toBeDefined();
  });
  it('should return profit/loss report', async () => {
    const data = await apiGet('ury.ury.api.ury_reports.get_profit_loss_report', { from_date: '2024-06-01' });
    expect(data.message.gross_profit).toBeDefined();
  });
});

describe('MSW Menu Management handlers', () => {
  it('should return menus', async () => {
    const data = await apiGet('ury.ury.api.ury_menu_management.get_menus');
    expect(data.message.length).toBeGreaterThan(0);
  });
  it('should return courses detail', async () => {
    const data = await apiGet('ury.ury.api.ury_menu_management.get_courses_detail');
    expect(data.message.length).toBeGreaterThan(0);
  });
  it('should return available items', async () => {
    const data = await apiGet('ury.ury.api.ury_menu_management.get_available_items');
    expect(data.message.length).toBeGreaterThan(0);
  });
});

describe('MSW dynamic handler overrides', () => {
  it('should override with server.use()', async () => {
    server.use(
      http.get(`${BASE}/api/method/frappe.auth.get_logged_user`, async () => {
        return HttpResponse.json({ message: 'overridden@test.com' });
      })
    );
    const data = await apiGet('frappe.auth.get_logged_user');
    expect(data.message).toBe('overridden@test.com');
  });

  it('should simulate 500 error', async () => {
    server.use(
      http.get(`${BASE}/api/method/ury.ury.api.ury_dashboard.get_live_metrics`, async () => {
        return new HttpResponse(null, { status: 500 });
      })
    );
    invalidateCache();
    const res = await fetch(`${BASE}/api/method/ury.ury.api.ury_dashboard.get_live_metrics`);
    expect(res.status).toBe(500);
  });

  it('should reset to defaults after resetHandlers()', async () => {
    server.use(
      http.get(`${BASE}/api/method/frappe.auth.get_logged_user`, async () => {
        return HttpResponse.json({ message: 'temp-override' });
      })
    );
    let data = await apiGet('frappe.auth.get_logged_user');
    expect(data.message).toBe('temp-override');

    server.resetHandlers();

    data = await apiGet('frappe.auth.get_logged_user');
    expect(data.message).toBe('Administrator');
  });
});
