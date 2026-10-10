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

export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.success,
      className: 'toast-success',
    });
  },
  /**
   * Errors stay until dismissed.
   *
   * They shared the 2s timer with success messages, so the one message a
   * user must act on was the one most likely to be gone before they looked
   * up — and a cashier mid-transaction is by definition looking somewhere
   * else (UX-11). Success can expire; a failure has to be read.
   */
  error: (message: string) => {
    toast.error(message, {
      autoClose: false,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.error,
      className: 'toast-error',
    });
  },
  warning: (message: string) => {
    toast.warning(message, {
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.warning,
      className: 'toast-warning',
    });
  },
  info: (message: string) => {
    toast.info(message, {
      autoClose: 2000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
      icon: toastIcons.info,
      className: 'toast-info',
    });
  },
};

export const ToastProvider = () => {
  // `rtl` was pinned false, so under Arabic the toast laid itself out against
  // the direction of everything around it. Read from <html dir>, which the
  // i18n engine already sets before first paint, rather than from a language
  // list this package would then have to keep in sync.
  const isRtl =
    typeof document !== 'undefined' && document.documentElement.dir === 'rtl'

  return (
    <ToastContainer
      position={isRtl ? 'top-left' : 'top-right'}
      autoClose={2000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={isRtl}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="colored"
    />
  );
};
