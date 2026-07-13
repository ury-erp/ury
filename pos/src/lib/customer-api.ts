import { DOCTYPES } from '../data/doctypes';
import { db, call } from './frappe-sdk';

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
}

export interface CreateCustomerResponse {
  data: CreateCustomerData;
  _server_messages?: string;
}


export async function getCustomerGroups() {
  const groups = await db.getDocList(DOCTYPES.CUSTOMER_GROUP, {
    fields: ['name'],
    limit: "*" as unknown as number,
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
    limit: "*" as unknown as number,
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
