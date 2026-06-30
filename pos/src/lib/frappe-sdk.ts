import { FrappeApp } from "frappe-js-sdk";

const frappe = new FrappeApp(import.meta.env.VITE_FRAPPE_BASE_URL);

export const call = frappe.call();
export const db = frappe.db();
export const auth = frappe.auth();