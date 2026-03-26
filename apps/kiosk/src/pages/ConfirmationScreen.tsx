/**
 * Confirmation Screen - Large order number, QR code to track, auto-reset timer
 * Shown after successful order placement
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Receipt, Smartphone, Utensils } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface ConfirmationScreenProps {
  orderToken: string;
  orderNumber: string;
  total: number;
  orderType: string;
  restaurantName: string;
  onReset: () => void;
}

const AUTO_RESET_SECONDS = 30;

export function ConfirmationScreen({
  orderToken,
  orderNumber,
  total,
  orderType,
  restaurantName,
  onReset,
}: ConfirmationScreenProps) {
  const [timeRemaining, setTimeRemaining] = useState(AUTO_RESET_SECONDS);
  const [showReceipt, setShowReceipt] = useState(false);

  // Auto-reset countdown
  useEffect(() => {
    if (timeRemaining <= 0) {
      onReset();
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, onReset]);

  // Format order tracking URL
  const trackingUrl = `${window.location.origin}/order-track?token=${orderToken}`;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gradient-to-br from-green-50 to-emerald-50 flex flex-col"
    >
      {/* Success animation */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 200 }}
          className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mb-8 shadow-xl shadow-green-500/30"
        >
          <CheckCircle2 className="w-16 h-16 text-white" />
        </motion.div>

        {/* Thank you message */}
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-4xl md:text-5xl font-bold text-foreground text-center mb-4"
        >
          Thank You!
        </motion.h2>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-xl text-gray-600 text-center mb-8"
        >
          Your order has been placed successfully
        </motion.p>

        {/* Order Number - Large and prominent */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl shadow-xl p-8 mb-8 text-center w-full max-w-md"
        >
          <p className="text-lg text-gray-500 mb-2 uppercase tracking-wide">Order Number</p>
          <p className="text-7xl md:text-8xl font-black text-primary tracking-tight">
            {orderNumber}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-gray-500">
            <Utensils className="w-5 h-5" />
            <span className="text-lg">{orderType}</span>
          </div>
        </motion.div>

        {/* Order details */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-2xl shadow-lg p-6 mb-8 w-full max-w-md"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-500">Restaurant</span>
            <span className="font-semibold text-lg">{restaurantName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total Amount</span>
            <span className="font-bold text-2xl text-primary">{formatPrice(total)}</span>
          </div>
        </motion.div>

        {/* QR Code */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center"
        >
          <p className="text-lg text-gray-600 mb-4 flex items-center justify-center gap-2">
            <Smartphone className="w-5 h-5" />
            Scan to track your order
          </p>
          <div className="bg-white p-4 rounded-2xl shadow-lg inline-block">
            <QRCodeSVG
              value={trackingUrl}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>
        </motion.div>
      </div>

      {/* Footer - Timer and actions */}
      <div className="bg-white border-t p-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Auto-reset timer */}
          <div className="flex items-center gap-3 text-gray-500">
            <Clock className="w-6 h-6" />
            <span className="text-lg">
              Returning to start in{' '}
              <span className="font-bold text-primary">{timeRemaining}s</span>
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-4">
            {/* Print receipt button */}
            <button
              onClick={() => setShowReceipt(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-lg hover:bg-gray-200 active:scale-95 transition-all"
            >
              <Receipt className="w-5 h-5" />
              Print Receipt
            </button>

            {/* Done button */}
            <button
              onClick={onReset}
              className="kiosk-btn-primary text-xl px-12"
            >
              I'm Done
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 max-w-4xl mx-auto">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: '100%' }}
              animate={{ width: `${(timeRemaining / AUTO_RESET_SECONDS) * 100}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>
        </div>
      </div>

      {/* Receipt Modal (simplified) */}
      {showReceipt && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowReceipt(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center border-b-2 border-dashed pb-6 mb-6">
              <h3 className="text-2xl font-bold mb-1">{restaurantName}</h3>
              <p className="text-gray-500">Self-Service Kiosk</p>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-500">Order #</span>
                <span className="font-bold text-xl">{orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-semibold">{orderType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-2xl">{formatPrice(total)}</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed pt-6 text-center">
              <p className="text-gray-500 mb-4">Thank you for your order!</p>
              <button
                onClick={() => setShowReceipt(false)}
                className="kiosk-btn-primary w-full"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

export default ConfirmationScreen;
