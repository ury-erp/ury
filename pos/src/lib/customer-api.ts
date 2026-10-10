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
}

export interface CreateCustomerResponse {
  data: CreateCustomerData;
  _server_messages?: string;
}

function getServerMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const payload = error as { _server_messages?: string; message?: string };
  if (payload.message) return payload.message;
  if (!payload._server_messages) return null;

  try {
    const messages = JSON.parse(payload._server_messages) as string[];
    const first = messages?.[0] ? JSON.parse(messages[0]) as { message?: string } : null;
    return first?.message || null;
  } catch {
    return null;
  }
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
      throw new Error(msg?.message || "Failed to create customer");
    }
    return {
      data: {
        customer_name: msg.customer_name,
        mobile_number: msg.mobile_number,
        customer_group: msg.customer_group,
        territory: msg.territory
      }
    };

  } catch (error) {
    console.error('Error creating customer:', error);
    throw new Error(getServerMessage(error) || (error instanceof Error ? error.message : 'Failed to create customer'));
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
