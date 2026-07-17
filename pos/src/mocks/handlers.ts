/**
 * MSW HTTP handlers for URY POS.
 *
 * Covers three URL patterns used by frappe-js-sdk:
 *   1. call.get/post  →  GET/POST /api/method/{method}
 *   2. db.getDoc      →  GET /api/resource/{doctype}/{docname}
 *   3. db.getDocList  →  GET /api/resource/{doctype}?params
 *
 * IMPORTANT: When VITE_MSW_ENABLED=true, VITE_FRAPPE_BASE_URL must be
 * empty or point to the same origin so that MSW service worker can
 * intercept requests. Cross-origin requests cannot be intercepted by
 * service workers.
 *
 * For Vitest (Node environment), handlers use the full URL including
 * http://localhost:8000 because setupServer has no same-origin restriction.
 *
 * This file uses relative paths which work in BOTH environments:
 * - Browser (service worker): relative paths match same-origin requests
 * - Node (setupServer): relative paths are resolved against the request URL
 *
 * SDK URL-encodes doctype names (e.g. "URY%20Room", "POS%20Profile"),
 * so handlers are registered for both URL-encoded and raw-space variants.
 */

import { http, HttpResponse, delay } from 'msw';
import {
  authFixtures,
  posProfileFixtures,
  menuFixtures,
  tableFixtures,
  customerFixtures,
  paymentFixtures,
  orderFixtures,
  dashboardFixtures,
  reportFixtures,
  menuManagementFixtures,
  aggregatorFixtures,
  posOpeningFixtures,
} from './fixtures';

// ─── Helper: parse URL search params into a simple object ──────────────────────
function paramsToObject(params: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => { obj[key] = value; });
  return obj;
}

// ─── Helper: parse JSON string params ──────────────────────────────────────────
function parseJsonParam(value: string | undefined): unknown {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return value; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AUTH HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const authHandlers = [
  http.get('*/api/method/frappe.auth.get_logged_user', async () => {
    return HttpResponse.json({ message: authFixtures.loggedInUser });
  }),
  http.post('*/api/method/logout', async () => {
    return HttpResponse.json(authFixtures.logoutResponse);
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DB RESOURCE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildResourceHandlers(
  doctype: string,
  handlers: {
    getDocList?: (params: Record<string, string>) => unknown[];
    getDoc?: (docname: string) => unknown;
    updateDoc?: (docname: string, data: Record<string, unknown>) => unknown;
  }
) {
  const encoded = encodeURIComponent(doctype);
  const variants = [encoded, doctype];
  const result: ReturnType<typeof http.get>[] = [];

  for (const variant of variants) {
    if (handlers.getDocList) {
      result.push(
        http.get(`*/api/resource/${variant}`, async ({ request }) => {
          const url = new URL(request.url);
          const params = paramsToObject(url.searchParams);
          const data = handlers.getDocList!(params);
          return HttpResponse.json({ data });
        })
      );
    }
    if (handlers.getDoc) {
      result.push(
        http.get(`*/api/resource/${variant}/:docname`, async ({ params }) => {
          const docname = params.docname as string;
          const data = handlers.getDoc!(docname);
          return HttpResponse.json({ data });
        })
      );
    }
    if (handlers.updateDoc) {
      result.push(
        http.put(`*/api/resource/${variant}/:docname`, async ({ params, request }) => {
          const docname = params.docname as string;
          const body = await request.json() as Record<string, unknown>;
          const data = handlers.updateDoc!(docname, body);
          return HttpResponse.json({ data });
        })
      );
    }
  }
  return result;
}

const userResourceHandlers = buildResourceHandlers('User', {
  getDoc: (docname) => ({ ...authFixtures.userDoc, name: docname }),
});

const roomResourceHandlers = buildResourceHandlers('URY Room', {
  getDocList: (params) => {
    const filters = parseJsonParam(params.filters) as string[][] | undefined;
    if (filters) {
      const branchFilter = filters.find((f) => f[0] === 'branch');
      if (branchFilter) {
        return tableFixtures.rooms.filter((r) => r.branch.includes(branchFilter[2] as string));
      }
    }
    return tableFixtures.rooms;
  },
});

const tableResourceHandlers = buildResourceHandlers('URY Table', {
  getDocList: (params) => {
    const filters = parseJsonParam(params.filters) as string[][] | undefined;
    const fields = parseJsonParam(params.fields) as string[] | undefined;
    if (fields?.length === 1 && fields[0].includes('count(')) {
      return [{ count: 4 }];
    }
    if (filters) {
      const roomFilter = filters.find((f) => f[0] === 'restaurant_room');
      if (roomFilter) {
        const room = roomFilter[2] as string;
        return tableFixtures.tables[room] || [];
      }
    }
    return Object.values(tableFixtures.tables).flat();
  },
  updateDoc: (docname, data) => ({
    ...tableFixtures.tables['Main Hall']?.find((t) => t.name === docname),
    ...data,
    name: docname,
  }),
});

const posProfileResourceHandlers = buildResourceHandlers('POS Profile', {
  getDoc: (docname) => ({ ...posProfileFixtures.full, name: docname }),
});

const currencyResourceHandlers = buildResourceHandlers('Currency', {
  getDoc: (docname) => ({ ...posProfileFixtures.currency, name: docname }),
});

const customerResourceHandlers = buildResourceHandlers('Customer', {
  getDocList: (params) => {
    const orFilters = parseJsonParam(params.or_filters) as string[][] | undefined;
    const limit = parseInt(params.limit || '20', 10);
    if (orFilters) {
      const searchTerms = orFilters
        .filter((f) => f[0] === 'customer_name' || f[0] === 'mobile_number')
        .map((f) => f[2] as string);
      if (searchTerms.length > 0) {
        const term = searchTerms[0].replace(/%/g, '').toLowerCase();
        return customerFixtures.customers.filter((c) =>
          c.customer_name.toLowerCase().includes(term) || c.mobile_number.includes(term)
        ).slice(0, limit);
      }
    }
    return customerFixtures.customers.slice(0, limit);
  },
});

const customerGroupResourceHandlers = buildResourceHandlers('Customer Group', {
  getDocList: () => customerFixtures.groups,
});

const territoryResourceHandlers = buildResourceHandlers('Territory', {
  getDocList: () => customerFixtures.territories,
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CALL METHOD HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const callMethodHandlers = [
  // ─── Menu ───────────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury_pos.api.getRestaurantMenu', async () => {
    return HttpResponse.json({ message: { items: menuFixtures.items } });
  }),
  http.get('*/api/method/ury.ury_pos.api.getAggregatorItem', async () => {
    return HttpResponse.json({ message: menuFixtures.aggregatorItems });
  }),
  http.get('*/api/method/ury.ury_pos.api.getMenuCourses', async () => {
    return HttpResponse.json({ message: menuFixtures.courses });
  }),

  // ─── Customer ───────────────────────────────────────────────────────────
  http.post('*/api/method/ury.ury_pos.api.create_customer', async () => {
    return HttpResponse.json(customerFixtures.createCustomerResponse);
  }),

  // ─── Payment ────────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury_pos.api.getModeOfPayment', async () => {
    return HttpResponse.json({ message: paymentFixtures.modes });
  }),

  // ─── Order ──────────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury.doctype.ury_order.ury_order.get_order_invoice', async ({ request }) => {
    const url = new URL(request.url);
    const table = url.searchParams.get('table');
    if (table === 'T-002') {
      return HttpResponse.json(orderFixtures.tableOrder);
    }
    return HttpResponse.json(orderFixtures.emptyTableOrder);
  }),
  http.post('*/api/method/ury.ury.doctype.ury_order.ury_order.sync_order', async () => {
    await delay(100);
    return HttpResponse.json(orderFixtures.syncOrderResponse);
  }),

  // ─── Invoice ────────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury_pos.api.getPosInvoice', async () => {
    return HttpResponse.json({ message: orderFixtures.posInvoices });
  }),
  http.get('*/api/method/ury.ury_pos.api.getPosInvoiceItems', async () => {
    return HttpResponse.json({ message: orderFixtures.posInvoiceItems });
  }),
  http.post('*/api/method/ury.ury_pos.api.updatePosInvoiceStatus', async () => {
    return HttpResponse.json(orderFixtures.updateInvoiceStatusResponse);
  }),
  http.get('*/api/method/ury.ury_pos.api.searchPosInvoice', async () => {
    return HttpResponse.json(orderFixtures.searchInvoiceResponse);
  }),
  http.get('*/api/method/frappe.www.printview.get_html_and_style', async () => {
    return HttpResponse.json(orderFixtures.printHtmlResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_print.network_printing', async () => {
    return HttpResponse.json({ message: { status: 'Success' } });
  }),
  http.post('*/api/method/ury.ury.api.ury_print.select_network_printer', async () => {
    return HttpResponse.json({ message: { printer: 'Printer-001' } });
  }),
  http.post('*/api/method/ury.ury.api.ury_print.qz_print_update', async () => {
    return HttpResponse.json({ message: { status: 'Success' } });
  }),

  // ─── Dashboard ──────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_dashboard_summary', async () => {
    return HttpResponse.json(dashboardFixtures.summary);
  }),
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_revenue_chart', async () => {
    return HttpResponse.json(dashboardFixtures.revenueChart);
  }),
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_orders_chart', async () => {
    return HttpResponse.json(dashboardFixtures.ordersChart);
  }),
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_category_sales_chart', async () => {
    return HttpResponse.json(dashboardFixtures.categorySales);
  }),
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_payment_method_chart', async () => {
    return HttpResponse.json(dashboardFixtures.paymentMethodChart);
  }),
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_table_occupancy', async () => {
    return HttpResponse.json(dashboardFixtures.tableOccupancy);
  }),
  http.get('*/api/method/ury.ury.api.ury_dashboard.get_live_metrics', async () => {
    return HttpResponse.json(dashboardFixtures.liveMetrics);
  }),

  // ─── Reports ────────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury.api.ury_reports.get_sales_report', async () => {
    return HttpResponse.json(reportFixtures.salesReport);
  }),
  http.get('*/api/method/ury.ury.api.ury_reports.get_expense_report', async () => {
    return HttpResponse.json(reportFixtures.expenseReport);
  }),
  http.get('*/api/method/ury.ury.api.ury_reports.get_profit_loss_report', async () => {
    return HttpResponse.json(reportFixtures.profitLossReport);
  }),
  http.get('*/api/method/ury.ury.api.ury_reports.export_report_pdf', async () => {
    return HttpResponse.json(reportFixtures.exportPdfResponse);
  }),

  // ─── POS Opening ────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury_pos.api.posOpening', async () => {
    return HttpResponse.json(posOpeningFixtures.posOpening);
  }),
  http.get('*/api/method/ury.ury_pos.api.validate_pos_close', async () => {
    return HttpResponse.json(posOpeningFixtures.validatePosClose);
  }),

  // ─── POS Profile (call method) ─────────────────────────────────────────
  http.get('*/api/method/ury.ury_pos.api.getPosProfile', async () => {
    return HttpResponse.json({ message: posProfileFixtures.limited });
  }),

  // ─── Menu Management ───────────────────────────────────────────────────
  http.get('*/api/method/ury.ury.api.ury_menu_management.get_menus', async () => {
    return HttpResponse.json(menuManagementFixtures.menus);
  }),
  http.get('*/api/method/ury.ury.api.ury_menu_management.get_menu_detail', async () => {
    return HttpResponse.json(menuManagementFixtures.menuDetail);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.create_menu', async () => {
    return HttpResponse.json(menuManagementFixtures.createMenuResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.toggle_menu', async () => {
    return HttpResponse.json(menuManagementFixtures.toggleMenuResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.add_menu_item', async () => {
    return HttpResponse.json(menuManagementFixtures.addMenuItemResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.update_menu_item', async () => {
    return HttpResponse.json(menuManagementFixtures.updateMenuItemResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.remove_menu_item', async () => {
    return HttpResponse.json(menuManagementFixtures.removeMenuItemResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.batch_update_prices', async () => {
    return HttpResponse.json(menuManagementFixtures.batchUpdatePricesResponse);
  }),
  http.get('*/api/method/ury.ury.api.ury_menu_management.get_courses_detail', async () => {
    return HttpResponse.json(menuManagementFixtures.coursesDetail);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.create_menu_course', async () => {
    return HttpResponse.json(menuManagementFixtures.createCourseResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.update_menu_course', async () => {
    return HttpResponse.json(menuManagementFixtures.updateCourseResponse);
  }),
  http.post('*/api/method/ury.ury.api.ury_menu_management.delete_menu_course', async () => {
    return HttpResponse.json(menuManagementFixtures.deleteCourseResponse);
  }),
  http.get('*/api/method/ury.ury.api.ury_menu_management.get_available_items', async () => {
    return HttpResponse.json(menuManagementFixtures.availableItems);
  }),

  // ─── Aggregator ─────────────────────────────────────────────────────────
  http.get('*/api/method/ury.ury_pos.api.getAggregator', async () => {
    return HttpResponse.json(aggregatorFixtures.aggregators);
  }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const handlers = [
  ...authHandlers,
  ...userResourceHandlers,
  ...roomResourceHandlers,
  ...tableResourceHandlers,
  ...posProfileResourceHandlers,
  ...currencyResourceHandlers,
  ...customerResourceHandlers,
  ...customerGroupResourceHandlers,
  ...territoryResourceHandlers,
  ...callMethodHandlers,
];
