import { toast, ToastContainer, ToastOptions } from 'react-toastify';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';

// Custom CSS for toast styling
import './toast.css';

const toastIcons = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
};

export const showToast = {
  success: (message: string, options?: ToastOptions) => {
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
      ...options,
    });
  },
  error: (message: string, options?: ToastOptions) => {
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
      ...options,
    });
  },
  info: (message: string, options?: ToastOptions) => {
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
      ...options,
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
