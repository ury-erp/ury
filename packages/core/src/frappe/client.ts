import { FrappeApp } from "frappe-js-sdk";

export function createFrappeClient(baseUrl: string | undefined = import.meta.env?.VITE_FRAPPE_BASE_URL) {
  return new FrappeApp(baseUrl as any);
}

const frappe = createFrappeClient();
const frappeCall = frappe.call();

export interface CallFunction {
  <T = any>(path: string, params?: any): Promise<T>;
  get: typeof frappeCall.get;
  post: typeof frappeCall.post;
  put: typeof frappeCall.put;
  delete: typeof frappeCall.delete;
}

const callImpl: any = (path: string, params?: any) => frappeCall.post(path, params);
callImpl.get = frappeCall.get.bind(frappeCall);
callImpl.post = frappeCall.post.bind(frappeCall);
callImpl.put = frappeCall.put.bind(frappeCall);
callImpl.delete = frappeCall.delete.bind(frappeCall);

export const call: CallFunction = callImpl;
export const db = frappe.db();
export const auth = frappe.auth();
