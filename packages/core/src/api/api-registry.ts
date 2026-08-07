/**
 * @file api-registry.ts
 * @description Centralized API Registry for URY POS.
 *
 * All API endpoints used across repositories, services, and components are registered here.
 * Repositories must resolve endpoints through this registry rather than hardcoding URLs.
 */

export type EndpointCategory = 'Master Data' | 'Projection' | 'Search' | 'Command';
export type CacheStrategyName = 'NetworkFirst' | 'StaleWhileRevalidate' | 'CacheFirst' | 'NoCache';
export type SyncBehaviorName = 'IMMEDIATE' | 'QUEUED' | 'READ_ONLY';

export interface ApiEndpointConfig {
  endpointKey: string;
  url: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  category: EndpointCategory;
  cacheStrategy: CacheStrategyName;
  offlineCapability: boolean;
  syncBehavior: SyncBehaviorName;
  timeoutMs: number;
  retryPolicy: {
    maxRetries: number;
    backoffBaseMs: number;
  };
  authRequired: boolean;
  description: string;
}

export class ApiRegistry {
  private registry: Map<string, ApiEndpointConfig> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Registers default production endpoints
   */
  private registerDefaults(): void {
    const defaultEndpoints: ApiEndpointConfig[] = [
      // 1. MASTER DATA ENDPOINTS
      {
        endpointKey: 'GET_RESTAURANT_MENU',
        url: 'ury.ury_pos.api.getRestaurantMenu',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches complete restaurant menu items and courses for POS profile',
      },
      {
        endpointKey: 'GET_MENU_COURSES',
        url: 'ury.ury_pos.api.getMenuCourses',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'StaleWhileRevalidate',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches active menu course list',
      },
      {
        endpointKey: 'GET_POS_PROFILE',
        url: 'ury.ury_pos.api.getPosProfile',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches active cashier POS profile configuration',
      },
      {
        endpointKey: 'GET_MODE_OF_PAYMENT',
        url: 'ury.ury_pos.api.getModeOfPayment',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'StaleWhileRevalidate',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches active payment modes configured for branch',
      },
      {
        endpointKey: 'GET_AGGREGATOR',
        url: 'ury.ury_pos.api.getAggregator',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'StaleWhileRevalidate',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches branch delivery aggregator partners (Zomato, Swiggy)',
      },
      {
        endpointKey: 'GET_AGGREGATOR_ITEM',
        url: 'ury.ury_pos.api.getAggregatorItem',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches partner-specific menu price list items',
      },
      {
        endpointKey: 'CHECK_POS_OPENING',
        url: 'ury.ury_pos.api.posOpening',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: false,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 500 },
        authRequired: true,
        description: 'Checks whether POS opening entry is open',
      },
      {
        endpointKey: 'VALIDATE_POS_CLOSE',
        url: 'ury.ury_pos.api.validate_pos_close',
        httpMethod: 'GET',
        category: 'Master Data',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: false,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 500 },
        authRequired: true,
        description: 'Validates unclosed daily POS session status',
      },

      // 2. PROJECTION & READ ENDPOINTS
      {
        endpointKey: 'GET_TABLES',
        url: 'api/resource/URY Table',
        httpMethod: 'GET',
        category: 'Projection',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches spatial table list and occupancy status via Resource API',
      },
      {
        endpointKey: 'GET_ROOMS',
        url: 'api/resource/URY Restaurant Room',
        httpMethod: 'GET',
        category: 'Projection',
        cacheStrategy: 'StaleWhileRevalidate',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches branch restaurant rooms',
      },
      {
        endpointKey: 'GET_POS_INVOICE',
        url: 'ury.ury_pos.api.getPosInvoice',
        httpMethod: 'GET',
        category: 'Projection',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches branch invoices by status (Draft, Unbilled, Recently Paid)',
      },
      {
        endpointKey: 'GET_POS_INVOICE_ITEMS',
        url: 'ury.ury_pos.api.getPosInvoiceItems',
        httpMethod: 'GET',
        category: 'Projection',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches invoice line items and tax details',
      },
      {
        endpointKey: 'GET_CASHIER_INVOICE',
        url: 'ury.ury_pos.api.getInvoiceForCashier',
        httpMethod: 'GET',
        category: 'Projection',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches cashier-specific order invoices',
      },
      {
        endpointKey: 'GET_SPLIT_GROUP',
        url: 'ury.ury_pos.api.get_split_group',
        httpMethod: 'GET',
        category: 'Projection',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Fetches split bill invoice group hierarchy',
      },

      // 3. SEARCH ENDPOINTS
      {
        endpointKey: 'SEARCH_CUSTOMER',
        url: 'api/resource/Customer',
        httpMethod: 'GET',
        category: 'Search',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 500 },
        authRequired: true,
        description: 'Production Customer Search via Frappe Resource API with or_filters fallback',
      },
      {
        endpointKey: 'SEARCH_POS_INVOICE',
        url: 'ury.ury_pos.api.searchPosInvoice',
        httpMethod: 'GET',
        category: 'Search',
        cacheStrategy: 'NetworkFirst',
        offlineCapability: true,
        syncBehavior: 'READ_ONLY',
        timeoutMs: 3000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 500 },
        authRequired: true,
        description: 'Searches invoices by invoice name, customer, or mobile number',
      },

      // 4. COMMAND & MUTATION ENDPOINTS
      {
        endpointKey: 'SYNC_ORDER',
        url: 'ury.ury.doctype.ury_order.ury_order.sync_order',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 10000,
        retryPolicy: { maxRetries: 5, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Creates or updates draft POS Invoice',
      },
      {
        endpointKey: 'CREATE_CUSTOMER',
        url: 'ury.ury_pos.api.create_customer',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Creates a new customer master record',
      },
      {
        endpointKey: 'MERGE_BILLS',
        url: 'ury.ury_pos.api.merge_bills',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Merges two draft POS invoices into a single bill',
      },
      {
        endpointKey: 'MERGE_TABLES_BATCH',
        url: 'ury.ury.doctype.ury_order.ury_order.merge_tables_batch',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Merges multiple tables under an anchor table',
      },
      {
        endpointKey: 'UNMERGE_TABLES',
        url: 'ury.ury.doctype.ury_order.ury_order.unmerge_tables',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Unmerges a merged table cluster',
      },
      {
        endpointKey: 'SPLIT_BILL',
        url: 'ury.ury.doctype.ury_order.ury_order.split_bill',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Splits line items into a new split bill',
      },
      {
        endpointKey: 'TABLE_TRANSFER',
        url: 'ury.ury.doctype.ury_order.ury_order.table_transfer',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Transfers active order invoice to another table',
      },
      {
        endpointKey: 'CAPTAIN_TRANSFER',
        url: 'ury.ury.doctype.ury_order.ury_order.captain_transfer',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Re-assigns order captain/waiter',
      },
      {
        endpointKey: 'MAKE_INVOICE',
        url: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 10000,
        retryPolicy: { maxRetries: 5, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Submits payment and settles POS invoice',
      },
      {
        endpointKey: 'CREATE_PAYMENT_ENTRY',
        url: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 10000,
        retryPolicy: { maxRetries: 5, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Submits payment entry for invoice (Alias for MAKE_INVOICE)',
      },
      {
        endpointKey: 'DELETE_DRAFT_INVOICE',
        url: 'ury.ury_pos.api.delete_draft_invoice',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Deletes draft POS invoice',
      },
      {
        endpointKey: 'CANCEL_ORDER',
        url: 'ury.ury.doctype.ury_order.ury_order.cancel_order',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Cancels active order invoice',
      },
      {
        endpointKey: 'QZ_PRINT_UPDATE',
        url: 'ury.ury.api.ury_print.qz_print_update',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Sets invoice_printed=1 on POS Invoice and releases table cluster reservation',
      },
      {
        endpointKey: 'SELECT_NETWORK_PRINTER',
        url: 'ury.ury.api.ury_print.select_network_printer',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: false,
        syncBehavior: 'IMMEDIATE',
        timeoutMs: 10000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Resolves network printer and triggers CUPS/PDF print via network_printing',
      },
      {
        endpointKey: 'NETWORK_PRINTING',
        url: 'ury.ury.api.ury_print.network_printing',
        httpMethod: 'POST',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: false,
        syncBehavior: 'IMMEDIATE',
        timeoutMs: 10000,
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Direct CUPS/PDF network print for a POS Invoice',
      },
      {
        endpointKey: 'KOT_REPRINT',
        url: 'ury.ury.api.ury_kot_reprint.reprint_kot',
        httpMethod: 'GET',
        category: 'Command',
        cacheStrategy: 'NoCache',
        offlineCapability: true,
        syncBehavior: 'QUEUED',
        timeoutMs: 5000,
        retryPolicy: { maxRetries: 3, backoffBaseMs: 1000 },
        authRequired: true,
        description: 'Reprints Kitchen Order Ticket (KOT) for an invoice',
      },
    ];

    for (const ep of defaultEndpoints) {
      this.registry.set(ep.endpointKey, ep);
    }
  }

  /**
   * Registers or updates an endpoint configuration
   */
  register(config: ApiEndpointConfig): void {
    this.registry.set(config.endpointKey, config);
  }

  /**
   * Resolves endpoint configuration by key
   */
  get(endpointKey: string): ApiEndpointConfig {
    const config = this.registry.get(endpointKey);
    if (!config) {
      throw new Error(`[ApiRegistry] Endpoint key '${endpointKey}' is not registered in ApiRegistry.`);
    }
    return config;
  }

  /**
   * Resolves the production URL string for an endpoint key
   */
  getUrl(endpointKey: string): string {
    return this.get(endpointKey).url;
  }

  /**
   * Retrieves all registered endpoint configurations
   */
  getAll(): ApiEndpointConfig[] {
    return Array.from(this.registry.values());
  }
}

export const apiRegistry = new ApiRegistry();
