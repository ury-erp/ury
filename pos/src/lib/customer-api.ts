import { DOCTYPES } from '../data/doctypes';
import { db, call, repositories, apiRegistry } from '@ury/core';
import { isNetworkError } from './network-utils';

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
  content?: string;
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

    const custName = msg.customer_name || customerData.customer_name;
    const phoneNum = msg.mobile_number || customerData.mobile_number;

    // Cache created customer in local customer repository
    await repositories.customers.put({
      id: custName,
      name: custName,
      phone: phoneNum,
      customer_name: custName,
      mobile_number: phoneNum,
      customer_group: msg.customer_group || customerData.customer_group,
      territory: msg.territory || customerData.territory,
      content: `Customer Name : ${custName} | Mobile Number : ${phoneNum}`,
    });

    return {
      data: {
        customer_name: custName,
        mobile_number: phoneNum,
        customer_group: msg.customer_group,
        territory: msg.territory
      }
    };
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    console.warn('Network addCustomer failed, storing in offline repository and queueing sync:', error);

    // Save temporary customer locally
    const tempId = `TEMP-CUST-${Date.now()}`;
    const custName = customerData.customer_name;
    const phoneNum = customerData.mobile_number;

    await repositories.customers.put({
      id: tempId,
      name: custName,
      phone: phoneNum,
      customer_name: custName,
      mobile_number: phoneNum,
      customer_group: customerData.customer_group,
      territory: customerData.territory,
      content: `Customer Name : ${custName} | Mobile Number : ${phoneNum}`,
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
        customer_name: custName,
        mobile_number: phoneNum,
        customer_group: customerData.customer_group,
        territory: customerData.territory,
        name: tempId,
      }
    };
  }
}

function getscramblePattern(text: string) {
  return `%${text.split("").join("%")}%`;
}

/**
 * Searches customers using production Frappe Resource API (/api/resource/Customer)
 * Supports:
 * - Online search via Frappe Resource API (matching develop branch pattern)
 * - Offline fallback from cached IndexedDB customers
 * - Identical return shape with name, customer_name, mobile_number, customer_group, territory, content
 * - Graceful handling when customer is not cached offline (returns empty array [])
 */
export async function searchCustomers(search: string, limit = 5): Promise<Customer[]> {
  const trimmed = search.trim();
  if (!trimmed) return [];

  const pattern = getscramblePattern(trimmed);

  try {
    // Exact production Resource API query matching develop branch GET /api/resource/Customer
    const results = await db.getDocList(DOCTYPES.CUSTOMER, {
      fields: ['name', 'customer_name', 'mobile_number', 'customer_group', 'territory'],
      orFilters: [
        ['customer_name', 'like', pattern],
        ['mobile_number', 'like', pattern],
        ['name', 'like', pattern],
      ],
      limit: limit,
      limit_start: 0,
      asDict: true,
    }) as any[];

    const list = results || [];

    // Cache search results in local customers repository for offline access.
    // Filter out any records without a valid primary key to avoid IndexedDB
    // DataError on putMany.
    const validCustomers = list.filter(
      c => c && typeof c.name === 'string' && c.name.trim().length > 0
    );
    if (validCustomers.length > 0) {
      await repositories.customers.putMany(
        validCustomers.map(c => ({
          id: c.name,
          name: c.customer_name || c.name,
          phone: c.mobile_number || '',
          customer_name: c.customer_name || c.name,
          mobile_number: c.mobile_number || '',
          customer_group: c.customer_group || '',
          territory: c.territory || '',
          content: `Customer Name : ${c.customer_name ?? c.name ?? ""} | Mobile Number : ${c.mobile_number ?? ""}`,
        }))
      );
    }

    return list.map((doc: any) => ({
      name: doc.name,
      customer_name: doc.customer_name ?? doc.name ?? '',
      mobile_number: doc.mobile_number ?? '',
      customer_group: doc.customer_group ?? '',
      territory: doc.territory ?? '',
      content: `Customer Name : ${doc.customer_name ?? doc.name ?? ""} | Mobile Number : ${doc.mobile_number ?? ""}`,
      doctype: 'Customer',
    })) as Customer[];
  } catch (error) {
    console.warn('[searchCustomers] Network API call failed. Attempting offline repository fallback:', error);
    try {
      const cached = await repositories.customers.searchByNameOrPhone(trimmed);
      if (cached && cached.length > 0) {
        return cached.slice(0, limit).map(c => ({
          name: c.id,
          customer_name: c.customer_name || c.name || c.id,
          mobile_number: c.mobile_number || c.phone || '',
          customer_group: c.customer_group || '',
          territory: c.territory || '',
          content: c.content || `Customer Name : ${c.customer_name || c.name || c.id} | Mobile Number : ${c.mobile_number || c.phone || ""}`,
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
