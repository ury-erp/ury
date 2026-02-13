import axios, { AxiosError } from 'axios';
import { showToast } from '../components/ui/toast';

// Create axios instance
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_FRAPPE_BASE_URL || '',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Track last error message to prevent duplicates
let lastErrorMessage = '';
let lastErrorTime = 0;
const DUPLICATE_ERROR_THRESHOLD = 300; // ms

// Response interceptor for global error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
        // Ignore canceled requests
        if (axios.isCancel(error)) {
            return Promise.reject(error);
        }

        // Ignore 401 errors (handled by auth system)
        if (error.response?.status === 401) {
            return Promise.reject(error);
        }

        // Extract error message
        const errorData = error.response?.data as any;
        const errorMessage =
            errorData?.message ||
            errorData?.error ||
            'Something went wrong. Please try again.';

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

export default apiClient;
