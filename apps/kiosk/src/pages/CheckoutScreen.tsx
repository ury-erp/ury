/**
 * Checkout Screen - Dine In/Take Away large buttons, optional phone input
 * Final step before placing order
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, UtensilsCrossed, ShoppingBag, Phone, ChevronRight, AlertCircle } from 'lucide-react';
import { CartItem } from '@ury/cart';
import { OrderType } from '@ury/config';

interface CheckoutScreenProps {
  cartItems: CartItem[];
  cartTotal: number;
  selectedOrderType: 'Dine In' | 'Take Away' | null;
  customerPhone: string;
  onSelectOrderType: (type: 'Dine In' | 'Take Away') => void;
  onPhoneChange: (phone: string) => void;
  onPlaceOrder: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function CheckoutScreen({
  cartItems,
  cartTotal,
  selectedOrderType,
  customerPhone,
  onSelectOrderType,
  onPhoneChange,
  onPlaceOrder,
  onBack,
  isSubmitting,
}: CheckoutScreenProps) {
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const formatPhone = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    // Format as (XXX) XXX-XXXX
    if (limited.length === 0) return '';
    if (limited.length <= 3) return `(${limited}`;
    if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhone(value);
    onPhoneChange(formatted);
    setPhoneError(null);
  };

  const validateAndSubmit = () => {
    if (!selectedOrderType) {
      return;
    }

    // Phone is optional, but if provided, validate it
    if (customerPhone) {
      const digits = customerPhone.replace(/\D/g, '');
      if (digits.length < 10) {
        setPhoneError('Please enter a valid phone number');
        return;
      }
    }

    onPlaceOrder();
  };

  const canSubmit = selectedOrderType && !isSubmitting;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="fixed inset-0 bg-gray-50 flex flex-col"
    >
      {/* Header */}
      <header className="bg-white shadow-sm px-8 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <h2 className="text-3xl font-bold text-foreground">Checkout</h2>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Order Type Selection */}
          <section>
            <h3 className="text-2xl font-bold text-foreground mb-6">
              How would you like to enjoy your meal?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dine In */}
              <button
                onClick={() => onSelectOrderType('Dine In')}
                className={selectedOrderType === 'Dine In' ? 'kiosk-order-type-selected' : 'kiosk-order-type'}
              >
                <div className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-colors ${
                  selectedOrderType === 'Dine In' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <UtensilsCrossed className="w-12 h-12" />
                </div>
                <div className="text-center">
                  <span className="text-2xl font-bold block mb-1">Dine In</span>
                  <span className="text-gray-500">Enjoy your meal here</span>
                </div>
              </button>

              {/* Take Away */}
              <button
                onClick={() => onSelectOrderType('Take Away')}
                className={selectedOrderType === 'Take Away' ? 'kiosk-order-type-selected' : 'kiosk-order-type'}
              >
                <div className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-colors ${
                  selectedOrderType === 'Take Away' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <ShoppingBag className="w-12 h-12" />
                </div>
                <div className="text-center">
                  <span className="text-2xl font-bold block mb-1">Take Away</span>
                  <span className="text-gray-500">Take your meal to go</span>
                </div>
              </button>
            </div>
          </section>

          {/* Phone Number (Optional) */}
          <section>
            <button
              onClick={() => setShowPhoneInput(!showPhoneInput)}
              className="flex items-center gap-3 text-xl font-semibold text-primary mb-4 hover:underline"
            >
              <Phone className="w-6 h-6" />
              Add phone number for order updates
              <ChevronRight className={`w-5 h-5 transition-transform ${showPhoneInput ? 'rotate-90' : ''}`} />
            </button>
            
            {showPhoneInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm">
                  <label className="block text-lg font-semibold text-gray-700 mb-3">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(555) 123-4567"
                    className={`kiosk-input ${phoneError ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''}`}
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                  {phoneError && (
                    <div className="flex items-center gap-2 mt-3 text-destructive">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">{phoneError}</span>
                    </div>
                  )}
                  <p className="text-gray-500 mt-3 text-base">
                    We'll text you when your order is ready
                  </p>
                </div>
              </motion.div>
            )}
          </section>

          {/* Order Summary */}
          <section className="bg-white rounded-3xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-foreground mb-4">Order Summary</h3>
            <div className="space-y-3 mb-4">
              {cartItems.map((item) => (
                <div key={item.uniqueId} className="flex items-center justify-between text-lg">
                  <span className="text-gray-600">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-semibold">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-4 flex items-center justify-between">
              <span className="text-2xl font-bold">Total</span>
              <span className="text-3xl font-bold text-primary">{formatPrice(cartTotal)}</span>
            </div>
          </section>
        </div>
      </div>

      {/* Footer - Place Order Button */}
      <div className="bg-white border-t p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={validateAndSubmit}
            disabled={!canSubmit}
            className="w-full kiosk-btn-primary text-2xl py-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Placing Order...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <span>Place Order</span>
                <span>•</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
            )}
          </button>
          {!selectedOrderType && (
            <p className="text-center text-gray-500 mt-3 text-lg">
              Please select Dine In or Take Away
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default CheckoutScreen;
