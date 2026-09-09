import { toast, ToastContainer } from 'react-toastify';
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';

// Custom CSS for toast styling
import './toast.css';

const toastIcons = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
};

// Derive a toastId from message content to prevent duplicate toasts
// Uses a simple hash to create a deterministic ID from the message string
const getToastId = (message: string): string => {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `toast-${Math.abs(hash)}`;
};

export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      position: 'top-right',
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.success,
      className: 'toast-success',
      toastId: getToastId(message),
    });
  },
  error: (message: string) => {
    toast.error(message, {
      position: 'top-right',
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.error,
      className: 'toast-error',
      toastId: getToastId(message),
    });
  },
  warning: (message: string) => {
    toast.warning(message, {
      position: 'top-right',
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.warning,
      className: 'toast-warning',
      toastId: getToastId(message),
    });
  },
  info: (message: string) => {
    toast.info(message, {
      position: 'top-right',
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.info,
      className: 'toast-info',
      toastId: getToastId(message),
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
      limit={3}
    />
  );
};
