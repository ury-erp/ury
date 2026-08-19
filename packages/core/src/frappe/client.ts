import { FrappeApp } from "frappe-js-sdk";

export function createFrappeClient(baseUrl: string | undefined = import.meta.env?.VITE_FRAPPE_BASE_URL) {
  return new FrappeApp(baseUrl as any);
}

const frappe = createFrappeClient();
const rawCall = frappe.call();

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

export const call = {
  get: async <T = any>(path: string, params?: any): Promise<T> => {
    try {
      return await rawCall.get(path, params);
    } catch (error: any) {
      throw safeCallError(error);
    }
  },
  post: async <T = any>(path: string, params?: any): Promise<T> => {
    try {
      return await rawCall.post(path, params);
    } catch (error: any) {
      throw safeCallError(error);
    }
  },
  put: async <T = any>(path: string, params?: any): Promise<T> => {
    try {
      return await rawCall.put(path, params);
    } catch (error: any) {
      throw safeCallError(error);
    }
  },
  delete: async <T = any>(path: string, params?: any): Promise<T> => {
    try {
      return await rawCall.delete(path, params);
    } catch (error: any) {
      throw safeCallError(error);
    }
  },
};

export const db = frappe.db();
export const auth = frappe.auth();
