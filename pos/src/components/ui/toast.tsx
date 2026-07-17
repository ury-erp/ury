import { toast, ToastContainer } from 'react-toastify';
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';

// Custom CSS for toast styling
import './toast.css';

/** Options that can be passed to toast methods */
export interface ToastOptions {
  /** Auto-close duration in ms (default varies by type) */
  duration?: number;
  /** Optional description text shown below the message */
  description?: string;
}

const toastIcons = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
};

/** Shared default toast configuration */
const defaultToastConfig = {
  position: 'top-right' as const,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: 'colored' as const,
};

export const showToast = {
  success: (message: string, options?: ToastOptions) => {
    toast.success(message, {
      ...defaultToastConfig,
      autoClose: options?.duration ?? 2000,
      icon: toastIcons.success,
      className: 'toast-success',
    });
  },
  error: (message: string, options?: ToastOptions) => {
    toast.error(message, {
      ...defaultToastConfig,
      autoClose: options?.duration ?? 2000,
      icon: toastIcons.error,
      className: 'toast-error',
    });
  },
  info: (message: string, options?: ToastOptions) => {
    toast.info(message, {
      ...defaultToastConfig,
      autoClose: options?.duration ?? 2000,
      icon: toastIcons.info,
      className: 'toast-info',
    });
  },
  warning: (message: string, options?: ToastOptions) => {
    toast.warning(message, {
      ...defaultToastConfig,
      autoClose: options?.duration ?? 2000,
      icon: toastIcons.warning,
      className: 'toast-warning',
    });
  },
};

export const ToastProvider = () => {
  return (
    <ToastContainer
      position="top-right"
      autoClose={2000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="colored"
    />
  );
};
