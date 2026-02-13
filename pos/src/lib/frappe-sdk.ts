import { FrappeApp } from "frappe-js-sdk";
import { showToast } from "../components/ui/toast";

const frappe = new FrappeApp(import.meta.env.VITE_FRAPPE_BASE_URL);

export const call = frappe.call();
export const db = frappe.db();
export const auth = frappe.auth();

// Access the underlying axios instance from Frappe SDK
const axiosInstance = (frappe as any).axios;

// Track last error message to prevent duplicates
let lastErrorMessage = '';
let lastErrorTime = 0;
const DUPLICATE_ERROR_THRESHOLD = 300; // ms

// Add global response interceptor for error handling
if (axiosInstance) {
    axiosInstance.interceptors.response.use(
        (response: any) => response,
        (error: any) => {
            // Ignore canceled requests
            if (error.code === 'ERR_CANCELED' || error.message === 'canceled') {
                return Promise.reject(error);
            }

            // Ignore 401 errors (handled by auth system)
            if (error.response?.status === 401) {
                return Promise.reject(error);
            }

            // Extract error message from various possible locations
            const errorData = error.response?.data;
            let errorMessage = 'Something went wrong. Please try again.';

            if (errorData) {
                // Frappe specific error format
                if (errorData.exception || errorData._server_messages) {
                    try {
                        const serverMessages = errorData._server_messages
                            ? JSON.parse(errorData._server_messages)
                            : [];
                        if (serverMessages.length > 0) {
                            const parsedMessage = JSON.parse(serverMessages[0]);
                            errorMessage = parsedMessage.message || errorMessage;
                        } else if (errorData.exception) {
                            errorMessage = errorData.exception;
                        }
                    } catch {
                        // Fallback to other fields
                        errorMessage = errorData.message || errorData.error || errorMessage;
                    }
                } else {
                    errorMessage = errorData.message || errorData.error || errorMessage;
                }
            }

            // Prevent duplicate toasts
            const now = Date.now();
            const isDuplicate =
                errorMessage === lastErrorMessage &&
                now - lastErrorTime < DUPLICATE_ERROR_THRESHOLD;

            if (!isDuplicate) {
                showToast.error(errorMessage);
                lastErrorMessage = errorMessage;
                lastErrorTime = now;
            }

            return Promise.reject(error);
        }
    );
}