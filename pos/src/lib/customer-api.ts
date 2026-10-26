import { DOCTYPES } from '../data/doctypes';
import { db, call } from '@ury/core';

export interface Customer {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: number;
  idx: number;
  naming_series: string;
  customer_name: string;
  customer_type: string;
  mobile_number: string;
  customer_group: string;
  territory: string;
  is_internal_customer: number;
  language: string;
  default_commission_rate: number;
  so_required: number;
  dn_required: number;
  is_frozen: number;
  disabled: number;
  doctype: string;
  companies: any[];
  credit_limits: any[];
  accounts: any[];
  sales_team: any[];
  portal_users: any[];
}

export interface CreateCustomerData {
  customer_name: string;
  mobile_number: string;
  customer_group?: string;
  territory?: string;
  name?: string;
  pos_profile?: string;
}

export interface CreateCustomerResponse {
  data: CreateCustomerData;
  _server_messages?: string;
}


export async function getCustomerGroups() {
  const groups = await db.getDocList(DOCTYPES.CUSTOMER_GROUP, {
    fields: ['name'],
    limit: 0,
    orderBy: {
      field: 'name',
      order: 'asc',
    },
  });
  return groups;
}

export async function getCustomerTerritories() {
  const territories = await db.getDocList(DOCTYPES.CUSTOMER_TERRITORY, {
    fields: ['name'],
    limit: 0,
    orderBy: {
      field: 'name',
      order: 'asc',
    },
  });
  return territories;
}

export async function addCustomer(
  customerData: CreateCustomerData
): Promise<CreateCustomerResponse> {
  try {
    const response = await call.post('ury.ury_pos.api.create_customer', customerData);
    const msg = response.message;
    if (!msg || msg.status !== "success") {
      throw new Error("Failed to create Customer,API Response error");
    }
    return {
      data: {
        name: msg.name,
        customer_name: msg.customer_name,
        mobile_number: msg.mobile_number,
        customer_group: msg.customer_group,
        territory: msg.territory
      }
    };

  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
}

function getscramblePattern(text: string) {
  return `%${text.split("").join("%")}%`;
}

export async function searchCustomers(search: string, limit = 5) {
  if (!search.trim()) return [];

  const pattern = getscramblePattern(search);

  try {
    const res = await db.getDocList(DOCTYPES.CUSTOMER, {
      fields: ["name", "customer_name", "mobile_number"],
      orFilters: [
        ["customer_name", "like", pattern],
        ["mobile_number", "like", pattern],
        ["name", "like", pattern],
      ],
      limit,
      limit_start: 0,
    });

    return res.map((doc: any) => ({
      ...doc,
      content: `Customer Name : ${doc.customer_name ?? ""} | Mobile Number : ${doc.mobile_number ?? ""}`,
    }));
  } catch (error) {
    console.error("Customer search error:", error);
    throw error;
  }
}

export interface OrderTypeCustomer {
  name: string;
  customer_name: string;
  mobile_number: string;
  content: string;
  is_order_type_match?: boolean;
  order_type?: string | null;
}

export async function getCustomersByOrderType(
  orderType?: string,
  search?: string,
  limit = 20
): Promise<OrderTypeCustomer[]> {
  try {
    const response = await call.get('ury.ury_pos.api.get_customers_by_order_type', {
      order_type: orderType || undefined,
      search: search?.trim() || undefined,
      limit,
    });
    const message = response?.message;
    const data = message?.data ?? message;
    if (Array.isArray(data)) {
      return data.map((doc: any) => ({
        name: doc.name || doc.customer,
        customer_name: doc.customer_name ?? doc.name,
        mobile_number: doc.mobile_number ?? '',
        content:
          doc.content ??
          `Customer Name : ${doc.customer_name ?? ''} | Mobile Number : ${doc.mobile_number ?? ''}`,
        is_order_type_match: doc.is_order_type_match ?? true,
        order_type: doc.order_type ?? orderType ?? null,
      }));
    }
    return [];
  } catch (error) {
    console.error('Error fetching customers by order type:', error);
    if (search?.trim()) {
      return searchCustomers(search, limit);
    }
    return [];
  }
}

