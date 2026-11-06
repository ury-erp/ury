import { FrappeApp } from "frappe-js-sdk";

export function createFrappeClient(baseUrl: string | undefined = import.meta.env?.VITE_FRAPPE_BASE_URL) {
  return new FrappeApp(baseUrl as any);
}

const frappe = createFrappeClient();
const frappeCall = frappe.call();

// Normalize transport-level failures into a shaped error so offline detection
// (isNetworkError) can distinguish them from server rejections.
frappe.axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error?.response) {
      error.response = {
        status: 0,
        statusText: 'Network Error',
        data: {
          message: error?.message || 'Network Disconnected',
          exception: 'NetworkError',
        },
        headers: {},
        config: error?.config,
      };
    }
    return Promise.reject(error);
  }
);

function safeCallError(error: any): Error {
  if (!error?.response) {
    return new Error(error?.message || 'Network Disconnected');
  }
  return error;
}

export interface CallFunction {
  <T = any>(path: string, params?: any): Promise<T>;
  get: typeof frappeCall.get;
  post: typeof frappeCall.post;
  put: typeof frappeCall.put;
  delete: typeof frappeCall.delete;
}

const callImpl: any = (path: string, params?: any) =>
  frappeCall.post(path, params).catch((error: any) => Promise.reject(safeCallError(error)));
callImpl.get = async <T = any>(path: string, params?: any): Promise<T> => {
  try {
    return await frappeCall.get<T>(path, params);
  } catch (error: any) {
    throw safeCallError(error);
  }
};
callImpl.post = async <T = any>(path: string, params?: any): Promise<T> => {
  try {
    return await frappeCall.post<T>(path, params);
  } catch (error: any) {
    throw safeCallError(error);
  }
};
callImpl.put = async <T = any>(path: string, params?: any): Promise<T> => {
  try {
    return await frappeCall.put<T>(path, params);
  } catch (error: any) {
    throw safeCallError(error);
  }
};
callImpl.delete = async <T = any>(path: string, params?: any): Promise<T> => {
  try {
    return await frappeCall.delete<T>(path, params);
  } catch (error: any) {
    throw safeCallError(error);
  }
};

export const call: CallFunction = callImpl;
export const db = frappe.db();
export const auth = frappe.auth();
