import { DOCTYPES } from '../data/doctypes';
import { db, call, repositories, apiRegistry } from '@ury/core';

export interface Customer {
  name: string;
  owner?: string;
  creation?: string;
  modified?: string;
  modified_by?: string;
  docstatus?: number;
  idx?: number;
  naming_series?: string;
  customer_name: string;
  customer_type?: string;
  mobile_number: string;
  customer_group?: string;
  territory?: string;
  is_internal_customer?: number;
  language?: string;
  default_commission_rate?: number;
  so_required?: number;
  dn_required?: number;
  is_frozen?: number;
  disabled?: number;
  doctype?: string;
  companies?: any[];
  credit_limits?: any[];
  accounts?: any[];
  sales_team?: any[];
  portal_users?: any[];
}

export interface CreateCustomerData {
  customer_name: string;
  mobile_number: string;
  customer_group?: string;
  territory?: string;
  name?: string;
}

export interface CreateCustomerResponse {
  data: CreateCustomerData;
  _server_messages?: string;
}

export async function getCustomerGroups() {
  try {
    const groups = await db.getDocList(DOCTYPES.CUSTOMER_GROUP, {
      fields: ['name'],
      limit: "*" as unknown as number,
      orderBy: {
        field: 'name',
        order: 'asc',
      },
    });
    return groups;
  } catch {
    return [{ name: 'All Customer Groups' }, { name: 'Commercial' }, { name: 'Individual' }];
  }
}

export async function getCustomerTerritories() {
  try {
    const territories = await db.getDocList(DOCTYPES.CUSTOMER_TERRITORY, {
      fields: ['name'],
      limit: "*" as unknown as number,
      orderBy: {
        field: 'name',
        order: 'asc',
      },
    });
    return territories;
  } catch {
    return [{ name: 'All Territories' }, { name: 'India' }];
  }
}

export async function addCustomer(
  customerData: CreateCustomerData
): Promise<CreateCustomerResponse> {
  const endpoint = apiRegistry.getUrl('CREATE_CUSTOMER');
  try {
    const response = await call.post(endpoint, customerData);
    const msg = response.message;
    if (!msg || msg.status !== "success") {
      throw new Error("Failed to create Customer, API Response error");
    }

    // Cache created customer in local customer repository
    await repositories.customers.put({
      id: msg.customer_name || customerData.customer_name,
      name: msg.customer_name || customerData.customer_name,
      phone: msg.mobile_number || customerData.mobile_number,
      customer_group: msg.customer_group || customerData.customer_group,
      territory: msg.territory || customerData.territory,
    });

    return {
      data: {
        customer_name: msg.customer_name,
        mobile_number: msg.mobile_number,
        customer_group: msg.customer_group,
        territory: msg.territory
      }
    };
  } catch (error) {
    console.warn('Network addCustomer failed, storing in offline repository and queueing sync:', error);

    // Save temporary customer locally
    const tempId = `TEMP-CUST-${Date.now()}`;
    await repositories.customers.put({
      id: tempId,
      name: customerData.customer_name,
      phone: customerData.mobile_number,
      customer_group: customerData.customer_group,
      territory: customerData.territory,
    });

    // Enqueue command for background sync
    await repositories.syncQueue.put({
      id: `SYNC-CUST-${Date.now()}`,
      action: 'create_customer',
      endpoint: endpoint,
      payload: customerData as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 2,
    });

    return {
      data: {
        customer_name: customerData.customer_name,
        mobile_number: customerData.mobile_number,
        customer_group: customerData.customer_group,
        territory: customerData.territory,
        name: tempId,
      }
    };
  }
}

/**
 * Searches customers using production Frappe Resource API (/api/resource/Customer)
 * Supports:
 * - Online search via Frappe Resource API
 * - Offline fallback from cached IndexedDB customers
 * - Graceful handling when customer is not cached offline (returns empty array [])
 */
export async function searchCustomers(search: string, limit = 5): Promise<Customer[]> {
  const trimmed = search.trim();
  if (!trimmed) return [];

  try {
    // Exact production Resource API query matching GET /api/resource/Customer
    const results = await db.getDocList(DOCTYPES.CUSTOMER, {
      fields: ['name', 'customer_name', 'mobile_number', 'customer_group', 'territory'],
      orFilters: [
        ['customer_name', 'like', `%${trimmed}%`],
        ['mobile_number', 'like', `%${trimmed}%`],
      ],
      orderBy: {
        field: 'customer_name',
        order: 'asc',
      },
      limit: limit,
      asDict: true,
    }) as unknown as Customer[];

    const list = results || [];

    // Cache search results in local customers repository for offline access
    if (list.length > 0) {
      await repositories.customers.putMany(
        list.map(c => ({
          id: c.name,
          name: c.customer_name || c.name,
          phone: c.mobile_number || '',
          customer_group: c.customer_group,
          territory: c.territory,
        }))
      );
    }

    return list;
  } catch (error) {
    console.warn('[searchCustomers] Network API call failed. Attempting offline repository fallback:', error);
    try {
      const cached = await repositories.customers.searchByNameOrPhone(trimmed);
      if (cached && cached.length > 0) {
        return cached.slice(0, limit).map(c => ({
          name: c.id,
          customer_name: c.name,
          mobile_number: c.phone,
          customer_group: c.customer_group || '',
          territory: c.territory || '',
          doctype: 'Customer',
        })) as Customer[];
      }
    } catch (cacheErr) {
      console.error('[searchCustomers] Error searching local IndexedDB cache:', cacheErr);
    }

    // Graceful offline fallback when customer is not cached
    return [];
  }
}
