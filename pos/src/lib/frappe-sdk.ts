/**
 * Frappe SDK lazy initialization.
 *
 * Uses lazy getters so that VITE_FRAPPE_BASE_URL is read at first access,
 * not at import time. This allows main.tsx to override the base URL
 * (e.g. set it to empty for MSW mode) before any API calls are made.
 *
 * Without lazy init, `new FrappeApp(import.meta.env.VITE_FRAPPE_BASE_URL)`
 * runs at import time, before main.tsx can change the env var.
 */

import { FrappeApp } from 'frappe-js-sdk';

let _frappe: ReturnType<typeof FrappeApp.prototype.call> extends (...args: unknown[]) => infer R
  ? FrappeApp
  : FrappeApp;
let _call: ReturnType<FrappeApp['call']>;
let _db: ReturnType<FrappeApp['db']>;
let _auth: ReturnType<FrappeApp['auth']>;
let _initialized = false;

function getFrappe(): FrappeApp {
  if (!_initialized) {
    _frappe = new FrappeApp(import.meta.env.VITE_FRAPPE_BASE_URL || '');
    _call = _frappe.call();
    _db = _frappe.db();
    _auth = _frappe.auth();
    _initialized = true;
  }
  return _frappe;
}

export const call = {
  get: <T = unknown>(method: string, params?: Record<string, unknown>) => {
    getFrappe();
    return _call.get<T>(method, params);
  },
  post: <T = unknown>(method: string, params?: Record<string, unknown>) => {
    getFrappe();
    return _call.post<T>(method, params);
  },
};

export const db = {
  getDocList: <T = unknown>(doctype: string, params?: Record<string, unknown>) => {
    getFrappe();
    return _db.getDocList<T>(doctype, params);
  },
  getDoc: <T = unknown>(doctype: string, name: string) => {
    getFrappe();
    return _db.getDoc<T>(doctype, name);
  },
  getValue: <T = unknown>(doctype: string, name: string, fieldname: string | string[]) => {
    getFrappe();
    return _db.getValue<T>(doctype, name, fieldname);
  },
  getCount: <T = unknown>(doctype: string, params?: Record<string, unknown>) => {
    getFrappe();
    return _db.getCount<T>(doctype, params);
  },
  updateDoc: <T = unknown>(doctype: string, name: string, data: Record<string, unknown>) => {
    getFrappe();
    return _db.updateDoc<T>(doctype, name, data);
  },
};

export const auth = {
  getLoggedInUser: () => {
    getFrappe();
    return _auth.getLoggedInUser();
  },
  logout: () => {
    getFrappe();
    return _auth.logout();
  },
};
