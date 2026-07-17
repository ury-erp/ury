/**
 * Realistic mock data fixtures for MSW handlers.
 * Covers all domains: auth, menu, tables, customers, payments, orders,
 * invoices, dashboard, reports, menu management, POS profile, aggregator.
 *
 * Data structures match the actual Frappe/URY API responses.
 */

// ─── AUTH ──────────────────────────────────────────────────────────────────────

export const authFixtures = {
  loggedInUser: 'Administrator',
  userDoc: {
    name: 'Administrator',
    full_name: 'Administrator',
    email: 'admin@example.com',
    roles: [
      { role: 'System Manager' },
      { role: 'POS Manager' },
    ],
  },
  logoutResponse: { message: 'Logged out' },
};

// ─── POS PROFILE ──────────────────────────────────────────────────────────────

export const posProfileFixtures = {
  limited: {
    pos_profile: 'Main POS',
    branch: 'Main Branch',
    company: 'URY Restaurant Ltd',
    waiter: 'John',
    warehouse: 'Main Warehouse',
    cashier: 'Admin',
    print_format: 'POS Invoice',
    qz_print: 0,
    qz_host: null,
    printer: null,
    print_type: 'thermal',
    tableAttention: 1,
    paid_limit: 0,
    disable_rounded_total: 0,
    enable_discount: 1,
    multiple_cashier: 0,
    owner: 'Administrator',
    edit_order_type: 1,
  },
  full: {
    name: 'Main POS',
    owner: 'Administrator',
    creation: '2024-01-01 10:00:00',
    modified: '2024-06-15 14:30:00',
    modified_by: 'Administrator',
    docstatus: 0,
    idx: 0,
    company: 'URY Restaurant Ltd',
    customer: null,
    country: 'Slovenia',
    disabled: 0,
    warehouse: 'Main Warehouse',
    campaign: null,
    company_address: null,
    restaurant: 'URY Restaurant',
    branch: 'Main Branch',
    currency: 'EUR',
    role_allowed_for_billing: [
      {
        name: 'perm-001',
        owner: 'Administrator',
        creation: '2024-01-01 10:00:00',
        modified: '2024-01-01 10:00:00',
        modified_by: 'Administrator',
        docstatus: 0,
        idx: 1,
        role: 'POS Manager',
        parent: 'Main POS',
        parentfield: 'role_allowed_for_billing',
        parenttype: 'POS Profile',
        doctype: 'POS Profile Role',
      },
    ],
    role_restricted_for_table_order: [],
    paid_limit: 0,
  },
  currency: {
    name: 'EUR',
    symbol: '\u20ac',
    fraction: 'Cent',
    fraction_units: 100,
    smallest_currency_fraction_value: 0.01,
    number_format: '#,###.##',
  },
};

// ─── MENU ──────────────────────────────────────────────────────────────────────

export const menuFixtures = {
  items: [
    { item: 'BURGER-001', item_name: 'Classic Burger', item_image: null, rate: 12.50, course: 'Main Course', course_label: 'Main Course', trending: true, popular: true, recommended: false, special_dish: 0 },
    { item: 'PIZZA-001', item_name: 'Margherita Pizza', item_image: null, rate: 14.00, course: 'Main Course', course_label: 'Main Course', trending: false, popular: true, recommended: true, special_dish: 0 },
    { item: 'SALAD-001', item_name: 'Caesar Salad', item_image: null, rate: 8.50, course: 'Starter', course_label: 'Starter', trending: false, popular: false, recommended: false, special_dish: 0 },
    { item: 'SOUP-001', item_name: 'Tomato Soup', item_image: null, rate: 6.00, course: 'Starter', course_label: 'Starter', trending: false, popular: false, recommended: false, special_dish: 0 },
    { item: 'COLA-001', item_name: 'Coca Cola', item_image: null, rate: 3.00, course: 'Beverages', course_label: 'Beverages', trending: false, popular: true, recommended: false, special_dish: 0 },
    { item: 'COFFEE-001', item_name: 'Espresso', item_image: null, rate: 2.50, course: 'Beverages', course_label: 'Beverages', trending: true, popular: true, recommended: true, special_dish: 1 },
    { item: 'CAKE-001', item_name: 'Chocolate Cake', item_image: null, rate: 5.50, course: 'Dessert', course_label: 'Dessert', trending: false, popular: true, recommended: false, special_dish: 0 },
    { item: 'ICECREAM-001', item_name: 'Vanilla Ice Cream', item_image: null, rate: 4.00, course: 'Dessert', course_label: 'Dessert', trending: false, popular: false, recommended: false, special_dish: 0 },
    { item: 'PASTA-001', item_name: 'Carbonara Pasta', item_image: null, rate: 11.00, course: 'Main Course', course_label: 'Main Course', trending: true, popular: true, recommended: true, special_dish: 0 },
    { item: 'WINE-001', item_name: 'House Wine', item_image: null, rate: 8.00, course: 'Beverages', course_label: 'Beverages', trending: false, popular: false, recommended: false, special_dish: 0 },
  ],
  courses: [
    { name: 'Starter', label: 'Starter', serving_priority: 1 },
    { name: 'Main Course', label: 'Main Course', serving_priority: 2 },
    { name: 'Dessert', label: 'Dessert', serving_priority: 3 },
    { name: 'Beverages', label: 'Beverages', serving_priority: 4 },
  ],
  aggregatorItems: [
    { item: 'BURGER-001', item_name: 'Classic Burger', item_image: null, rate: 13.00, course: 'Main Course', course_label: 'Main Course', trending: true, popular: true, recommended: false, special_dish: 0 },
    { item: 'PIZZA-001', item_name: 'Margherita Pizza', item_image: null, rate: 15.00, course: 'Main Course', course_label: 'Main Course', trending: false, popular: true, recommended: true, special_dish: 0 },
  ],
};

// ─── TABLES ────────────────────────────────────────────────────────────────────

export const tableFixtures = {
  rooms: [
    { name: 'Main Hall', branch: 'Main Branch' },
    { name: 'Terrace', branch: 'Main Branch' },
    { name: 'VIP Room', branch: 'Main Branch' },
  ],
  tables: {
    'Main Hall': [
      { name: 'T-001', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Circle' as const, no_of_seats: 4, layout_x: 100, layout_y: 100, minimum_seating: 2 },
      { name: 'T-002', occupied: 1, latest_invoice_time: '2024-06-15 12:30:00', is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Square' as const, no_of_seats: 2, layout_x: 300, layout_y: 100, minimum_seating: 1 },
      { name: 'T-003', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Rectangle' as const, no_of_seats: 6, layout_x: 500, layout_y: 100, minimum_seating: 4 },
      { name: 'T-004', occupied: 1, latest_invoice_time: '2024-06-15 13:00:00', is_take_away: 0, restaurant_room: 'Main Hall', table_shape: 'Circle' as const, no_of_seats: 4, layout_x: 100, layout_y: 300, minimum_seating: 2 },
    ],
    'Terrace': [
      { name: 'T-101', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Terrace', table_shape: 'Circle' as const, no_of_seats: 4, layout_x: 100, layout_y: 100, minimum_seating: 2 },
      { name: 'T-102', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'Terrace', table_shape: 'Square' as const, no_of_seats: 2, layout_x: 300, layout_y: 100, minimum_seating: 1 },
    ],
    'VIP Room': [
      { name: 'T-201', occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: 'VIP Room', table_shape: 'Rectangle' as const, no_of_seats: 10, layout_x: 200, layout_y: 200, minimum_seating: 6 },
    ],
  },
};

// ─── CUSTOMERS ─────────────────────────────────────────────────────────────────

export const customerFixtures = {
  groups: [
    { name: 'All Customer Groups' },
    { name: 'Individual' },
    { name: 'Corporate' },
    { name: 'VIP' },
  ],
  territories: [
    { name: 'All Territories' },
    { name: 'Slovenia' },
    { name: 'Croatia' },
    { name: 'Italy' },
  ],
  customers: [
    { name: 'CUST-001', customer_name: 'Janez Novak', mobile_number: '+38640123456' },
    { name: 'CUST-002', customer_name: 'Maja Kranjc', mobile_number: '+38640654321' },
    { name: 'CUST-003', customer_name: 'Ana Zupan', mobile_number: '+38640987654' },
    { name: 'CUST-004', customer_name: 'Marko Celarc', mobile_number: '+38640555123' },
  ],
  createCustomerResponse: {
    message: {
      name: 'CUST-NEW-001',
      customer_name: 'New Customer',
      mobile_number: '+38640111222',
    },
  },
};

// ─── PAYMENTS ──────────────────────────────────────────────────────────────────

export const paymentFixtures = {
  modes: [
    { mode_of_payment: 'Cash' },
    { mode_of_payment: 'Credit Card' },
    { mode_of_payment: 'Debit Card' },
    { mode_of_payment: 'Mobile Payment' },
  ],
};

// ─── ORDERS & INVOICES ─────────────────────────────────────────────────────────

export const orderFixtures = {
  tableOrder: {
    message: {
      name: 'INV-2024-001',
      title: 'POS Invoice',
      customer: 'CUST-001',
      customer_name: 'Janez Novak',
      mobile_number: '+38640123456',
      customer_group: 'Individual',
      territory: 'Slovenia',
      posting_date: '2024-06-15',
      posting_time: '12:30:00',
      order_type: 'Dine In',
      restaurant_table: 'T-002',
      custom_restaurant_room: 'Main Hall',
      status: 'Unpaid',
      total: 25.00,
      grand_total: 25.00,
      items: [
        { name: 'INV-ITEM-001', item_code: 'BURGER-001', item_name: 'Classic Burger', description: 'Juicy beef burger', item_group: 'Main Course', image: '', qty: 1, comment: '', rate: 12.50, amount: 12.50, discount_percentage: 0, discount_amount: 0 },
        { name: 'INV-ITEM-002', item_code: 'COLA-001', item_name: 'Coca Cola', description: 'Refreshing drink', item_group: 'Beverages', image: '', qty: 2, comment: '', rate: 3.00, amount: 6.00, discount_percentage: 0, discount_amount: 0 },
        { name: 'INV-ITEM-003', item_code: 'CAKE-001', item_name: 'Chocolate Cake', description: 'Rich chocolate dessert', item_group: 'Dessert', image: '', qty: 1, comment: 'No whipped cream', rate: 5.50, amount: 5.50, discount_percentage: 0, discount_amount: 0 },
      ],
    },
  },
  emptyTableOrder: { message: null },
  syncOrderResponse: {
    message: { name: 'INV-2024-002', status: 'Success' },
  },
  posInvoices: [
    { name: 'INV-2024-001', customer: 'CUST-001', customer_name: 'Janez Novak', grand_total: 25.00, status: 'Unpaid', posting_date: '2024-06-15', posting_time: '12:30:00', order_type: 'Dine In' },
    { name: 'INV-2024-002', customer: 'CUST-002', customer_name: 'Maja Kranjc', grand_total: 14.00, status: 'Paid', posting_date: '2024-06-15', posting_time: '13:00:00', order_type: 'Takeaway' },
  ],
  posInvoiceItems: [
    { name: 'INV-ITEM-001', item_code: 'BURGER-001', item_name: 'Classic Burger', qty: 1, rate: 12.50, amount: 12.50 },
  ],
  updateInvoiceStatusResponse: { message: { status: 'Success' } },
  searchInvoiceResponse: {
    message: [
      { name: 'INV-2024-001', customer_name: 'Janez Novak', grand_total: 25.00, status: 'Unpaid' },
    ],
  },
  printHtmlResponse: {
    message: { html: '<div>POS Invoice Print</div>', style: '<style>body{font-family:sans-serif;}</style>' },
  },
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────

export const dashboardFixtures = {
  summary: {
    message: {
      total_revenue: 4523.50,
      total_orders: 87,
      average_order_value: 51.99,
      order_type_breakdown: { 'Dine In': 45, 'Takeaway': 25, 'Delivery': 17 },
      top_items: [
        { item: 'Classic Burger', qty: 32, revenue: 400.00 },
        { item: 'Margherita Pizza', qty: 28, revenue: 392.00 },
        { item: 'Espresso', qty: 45, revenue: 112.50 },
      ],
    },
  },
  revenueChart: {
    message: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{ name: 'Revenue', values: [520, 680, 590, 750, 890, 1020, 480] }],
    },
  },
  ordersChart: {
    message: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{ name: 'Orders', values: [12, 15, 13, 18, 22, 28, 9] }],
    },
  },
  categorySales: {
    message: {
      data: [
        { category: 'Main Course', total_amount: 2100.00, total_qty: 65 },
        { category: 'Beverages', total_amount: 850.00, total_qty: 120 },
        { category: 'Dessert', total_amount: 520.00, total_qty: 45 },
        { category: 'Starter', total_amount: 450.00, total_qty: 38 },
      ],
    },
  },
  paymentMethodChart: {
    message: {
      data: [
        { mode_of_payment: 'Cash', total: 2200.50, count: 45 },
        { mode_of_payment: 'Credit Card', total: 1500.00, count: 28 },
        { mode_of_payment: 'Debit Card', total: 623.00, count: 10 },
        { mode_of_payment: 'Mobile Payment', total: 200.00, count: 4 },
      ],
    },
  },
  tableOccupancy: {
    message: {
      total_tables: 7,
      occupied_tables: 2,
      occupancy_rate: 28.57,
      room_breakdown: [
        { room: 'Main Hall', total: 4, occupied: 2 },
        { room: 'Terrace', total: 2, occupied: 0 },
        { room: 'VIP Room', total: 1, occupied: 0 },
      ],
    },
  },
  liveMetrics: {
    message: {
      active_orders: 3,
      pending_payments: 1,
      average_wait_time: 12.5,
      kitchen_queue: 5,
    },
  },
};

// ─── REPORTS ───────────────────────────────────────────────────────────────────

export const reportFixtures = {
  salesReport: {
    message: {
      total_sales: 12500.00,
      total_orders: 245,
      average_order: 51.02,
      items_sold: 680,
      top_selling_items: [
        { item_name: 'Classic Burger', qty: 55, revenue: 687.50 },
        { item_name: 'Espresso', qty: 82, revenue: 205.00 },
        { item_name: 'Margherita Pizza', qty: 42, revenue: 588.00 },
      ],
      daily_breakdown: [
        { date: '2024-06-09', sales: 1650.00, orders: 33 },
        { date: '2024-06-10', sales: 1820.00, orders: 36 },
        { date: '2024-06-11', sales: 1580.00, orders: 31 },
        { date: '2024-06-12', sales: 2100.00, orders: 42 },
        { date: '2024-06-13', sales: 2350.00, orders: 47 },
        { date: '2024-06-14', sales: 1950.00, orders: 39 },
        { date: '2024-06-15', sales: 1050.00, orders: 17 },
      ],
    },
  },
  expenseReport: {
    message: {
      total_expenses: 5200.00,
      categories: [
        { category: 'Food Supplies', amount: 2800.00 },
        { category: 'Utilities', amount: 850.00 },
        { category: 'Staff Wages', amount: 1200.00 },
        { category: 'Maintenance', amount: 350.00 },
      ],
    },
  },
  profitLossReport: {
    message: {
      revenue: 12500.00,
      expenses: 5200.00,
      gross_profit: 7300.00,
      margin: 58.4,
    },
  },
  exportPdfResponse: {
    message: {
      file_url: '/api/method/ury.ury.api.ury_reports.export_report_pdf?report_type=sales&period=last_7_days',
    },
  },
};

// ─── MENU MANAGEMENT ──────────────────────────────────────────────────────────

export const menuManagementFixtures = {
  menus: {
    message: [
      { name: 'Lunch Menu', branch: 'Main Branch', enabled: 1, item_count: 15 },
      { name: 'Dinner Menu', branch: 'Main Branch', enabled: 1, item_count: 22 },
      { name: 'Weekend Brunch', branch: 'Main Branch', enabled: 0, item_count: 8 },
    ],
  },
  menuDetail: {
    message: {
      name: 'Lunch Menu',
      branch: 'Main Branch',
      enabled: 1,
      items: [
        { name: 'MENU-ITEM-001', item: 'BURGER-001', item_name: 'Classic Burger', rate: 12.50, course: 'Main Course', special_dish: 0, disabled: 0 },
        { name: 'MENU-ITEM-002', item: 'PIZZA-001', item_name: 'Margherita Pizza', rate: 14.00, course: 'Main Course', special_dish: 0, disabled: 0 },
        { name: 'MENU-ITEM-003', item: 'SALAD-001', item_name: 'Caesar Salad', rate: 8.50, course: 'Starter', special_dish: 0, disabled: 0 },
        { name: 'MENU-ITEM-004', item: 'COFFEE-001', item_name: 'Espresso', rate: 2.50, course: 'Beverages', special_dish: 1, disabled: 0 },
        { name: 'MENU-ITEM-005', item: 'CAKE-001', item_name: 'Chocolate Cake', rate: 5.50, course: 'Dessert', special_dish: 0, disabled: 0 },
      ],
    },
  },
  createMenuResponse: { message: { name: 'New Menu', branch: 'Main Branch', enabled: 1 } },
  toggleMenuResponse: { message: { name: 'Lunch Menu', enabled: 0 } },
  addMenuItemResponse: { message: { name: 'MENU-ITEM-NEW', item: 'NEW-001', item_name: 'New Dish', rate: 10.00, course: 'Main Course' } },
  updateMenuItemResponse: { message: { name: 'MENU-ITEM-001', rate: 13.50 } },
  removeMenuItemResponse: { message: { status: 'Success' } },
  batchUpdatePricesResponse: { message: { updated: 3 } },
  coursesDetail: {
    message: [
      { name: 'Starter', serving_priority: 1, indicate_in_kds: 1 },
      { name: 'Main Course', serving_priority: 2, indicate_in_kds: 1 },
      { name: 'Dessert', serving_priority: 3, indicate_in_kds: 0 },
      { name: 'Beverages', serving_priority: 4, indicate_in_kds: 0 },
    ],
  },
  createCourseResponse: { message: { name: 'Kids Menu', serving_priority: 5, indicate_in_kds: 0 } },
  updateCourseResponse: { message: { name: 'Starter', serving_priority: 1, indicate_in_kds: 1 } },
  deleteCourseResponse: { message: { status: 'Success' } },
  availableItems: {
    message: [
      { item: 'STEAK-001', item_name: 'Ribeye Steak', rate: 25.00 },
      { item: 'FISH-001', item_name: 'Grilled Salmon', rate: 22.00 },
      { item: 'RISOTTO-001', item_name: 'Mushroom Risotto', rate: 16.00 },
    ],
  },
};

// ─── AGGREGATOR ────────────────────────────────────────────────────────────────

export const aggregatorFixtures = {
  aggregators: {
    message: [
      { customer: 'Wolt', name: 'AGG-001' },
      { customer: 'Uber Eats', name: 'AGG-002' },
      { customer: 'Glovo', name: 'AGG-003' },
    ],
  },
};

// ─── POS OPENING ──────────────────────────────────────────────────────────────

export const posOpeningFixtures = {
  posOpening: {
    message: {
      pos_opening_entry: 'POE-2024-001',
      pos_profile: 'Main POS',
      status: 'Open',
    },
  },
  validatePosClose: {
    message: {
      can_close: true,
      difference: 0,
      details: { opening_amount: 200.00, closing_amount: 200.00 },
    },
  },
};
