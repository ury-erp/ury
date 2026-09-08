import { apiErrorMessage } from './api-error';
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
  /** Opaque ERPNext child tables; Serve never reads these rows. */
  companies: unknown[];
  credit_limits: unknown[];
  accounts: unknown[];
  sales_team: unknown[];
  portal_users: unknown[];
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
    throw new Error(apiErrorMessage(error, 'Failed to create customer'));
  }
}

function getscramblePattern(text: string) {
  return `%${text.split("").join("%")}%`;
}

/** Fields requested by `searchCustomers` from Customer DocType. */
interface CustomerSearchDoc {
  name: string;
  customer_name?: string | null;
  mobile_number?: string | null;
}

export async function searchCustomers(search: string, limit = 5) {
  if (!search.trim()) return [];

  const pattern = getscramblePattern(search);

  try {
    const res = (await db.getDocList(DOCTYPES.CUSTOMER, {
      fields: ["name", "customer_name", "mobile_number"],
      orFilters: [
        ["customer_name", "like", pattern],
        ["mobile_number", "like", pattern],
        ["name", "like", pattern],
      ],
      limit,
      limit_start: 0,
    })) as CustomerSearchDoc[];

    return res.map((doc) => ({
      ...doc,
      content: `Customer Name : ${doc.customer_name ?? ""} | Mobile Number : ${doc.mobile_number ?? ""}`,
    }));
  } catch (error) {
    console.error("Customer search error:", error);
    throw error;
  }
}
