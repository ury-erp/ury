import React, { useState, useEffect } from 'react';
import { X, Percent, Coins } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn, formatCurrency } from '../lib/utils';
import { Button, Input, Dialog, DialogContent } from './ui';
import { call } from '../lib/frappe-sdk';
import { DEFAULT_PAYMENT_MODE } from '../data/order-types';
import { t } from '../i18n';


interface PaymentDialogProps {
  onClose: () => void;
  grandTotal: number;
  roundedTotal: number;
  invoice: string;
  customer: string;
  posProfile: string;
  table: string | null;
  cashier: string;
  owner: string;
  fetchOrders: () => Promise<void>;
  clearSelectedOrder: () => void;
}

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  onClose,
  grandTotal,
  roundedTotal,
  invoice,
  customer,
  posProfile,
  table,
  cashier,
  owner,
  fetchOrders,
  clearSelectedOrder
}) => {
  const { paymentModes, fetchPaymentModes, posProfile: storePosProfile } = usePOSStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountType] = useState<'percentage'>('percentage'); // Only percentage now
  const [discountValue, setDiscountValue] = useState<string>('');
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  // Modes ticked by the cashier, in the order they were ticked.
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  // Amounts typed by hand. The balancing mode is absent from this map — its
  // amount is always derived from what is left to pay.
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  // The mode that soaks up the remainder. Null once the cashier types into the
  // last balancing mode, i.e. every selected amount is then explicit.
  const [balancingMode, setBalancingMode] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentModes();
  }, [fetchPaymentModes]);

  // Payment modes come back as plain strings today, but older callers passed
  // { id, name } objects — normalise both into one shape.
  const modeOptions: { id: string; label: string }[] = paymentModes.map((mode: any) =>
    typeof mode === 'string' ? { id: mode, label: mode } : { id: mode.id, label: mode.name ?? mode.id }
  );

  const handleApplyDiscount = () => {
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      setError(t('errors.invalid_discount'));
      return;
    }
    if (value > 100) {
      setError(t('errors.discount_exceeds_max'));
      return;
    }
    const calculatedDiscount = (grandTotal * value) / 100;
    setAppliedDiscount(calculatedDiscount);
    setError(null);
  };

  // Order summary logic
  const subtotal = grandTotal;
  const adjustment = roundedTotal - grandTotal;
  const roundedAdjustment = Math.round(adjustment * 100) / 100;
  const showAdjustment = Math.abs(roundedAdjustment) > 0.001;
  const totalDiscount = appliedDiscount;
  const discountedTotal = Math.max(0, subtotal - totalDiscount);
  // If discount is applied, round up; else, round normally
  const finalTotal = appliedDiscount > 0 ? Math.ceil(discountedTotal) : Math.round(discountedTotal);
  const finalAdjustment = finalTotal - discountedTotal;
  const roundedFinalAdjustment = Math.round(finalAdjustment * 100) / 100;
  const showFinalAdjustment = Math.abs(roundedFinalAdjustment) > 0.001;

  // Tick one mode by default (Cash when the profile has it) and let it carry
  // the whole bill, so the common single-mode sale needs no typing at all.
  useEffect(() => {
    if (modeOptions.length === 0) return;

    // The store seeds paymentModes with Cash before the profile's real list
    // arrives; drop anything the profile turns out not to offer.
    const stillOffered = selectedModes.filter(id => modeOptions.some(m => m.id === id));
    if (stillOffered.length > 0) {
      if (stillOffered.length !== selectedModes.length) {
        setSelectedModes(stillOffered);
        if (balancingMode && !stillOffered.includes(balancingMode)) {
          setBalancingMode(stillOffered[0]);
        }
      }
      return;
    }

    const fallback = modeOptions.find(m => m.id === DEFAULT_PAYMENT_MODE)?.id ?? modeOptions[0].id;
    setSelectedModes([fallback]);
    setBalancingMode(fallback);
    setManualAmounts({});
    // modeOptions is rebuilt every render, so this keys off the raw list.
  }, [paymentModes]);

  const round2 = (value: number) => Math.round(value * 100) / 100;

  // Everything the cashier typed, i.e. every selected mode except the
  // balancing one.
  const manualTotal = selectedModes
    .filter(id => id !== balancingMode)
    .reduce((sum, id) => sum + (parseFloat(manualAmounts[id]) || 0), 0);
  const balancingAmount = balancingMode ? Math.max(0, round2(finalTotal - manualTotal)) : 0;

  const amountFor = (id: string) =>
    id === balancingMode ? balancingAmount : parseFloat(manualAmounts[id]) || 0;

  const inputValueFor = (id: string) =>
    id === balancingMode ? String(balancingAmount) : manualAmounts[id] ?? '';

  const payments = selectedModes
    .map(id => ({ mode_of_payment: id, amount: amountFor(id) }))
    .filter(p => p.amount > 0);
  const paymentsTotal = round2(payments.reduce((sum, p) => sum + p.amount, 0));

  // Ticking a mode on gives it a blank box to type into (the balancing mode
  // shrinks to match). Ticking one off hands its amount back to whichever mode
  // is balancing — untick Cash after picking UPI and the full bill lands on UPI.
  const toggleMode = (id: string) => {
    const isSelected = selectedModes.includes(id);

    if (isSelected) {
      const remaining = selectedModes.filter(m => m !== id);
      setSelectedModes(remaining);
      setManualAmounts(prev => {
        const next = { ...prev };
        delete next[id];
        if (id === balancingMode && remaining.length > 0) delete next[remaining[0]];
        return next;
      });
      if (id === balancingMode) setBalancingMode(remaining[0] ?? null);
      return;
    }

    setSelectedModes(prev => [...prev, id]);
    if (balancingMode === null) {
      // No mode is absorbing the remainder (the cashier fixed the amounts on
      // the others), so the newly ticked one takes what is left.
      setManualAmounts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setBalancingMode(id);
    } else {
      setManualAmounts(prev => ({ ...prev, [id]: '' }));
    }
  };

  // Typing into the balancing mode pins that amount and moves the balancing
  // role to the most recently ticked mode, so the split always adds up.
  const handleAmountChange = (id: string, value: string) => {
    if (id === balancingMode) {
      // Emptying the auto field would leave nothing covering the bill; keep it
      // balancing and let it snap back to the remainder.
      if (value === '') return;
      const others = selectedModes.filter(m => m !== id);
      const nextBalancing = others.length > 0 ? others[others.length - 1] : null;
      setManualAmounts(prev => {
        const next = { ...prev, [id]: value };
        if (nextBalancing) delete next[nextBalancing];
        return next;
      });
      setBalancingMode(nextBalancing);
      return;
    }
    setManualAmounts(prev => ({ ...prev, [id]: value }));
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await call.post('ury.ury.doctype.ury_order.ury_order.make_invoice', {
        additionalDiscount: discountValue ? parseInt(discountValue) : null,
        cashier,
        customer,
        invoice,
        owner,
        payments,
        pos_profile: posProfile,
        table,
      });
      // Show toast and reload orders (assume showToast and reload available globally)
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast.success('Payment successful');
      }
      onClose();
      clearSelectedOrder();
      await fetchOrders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent variant="xlarge" className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row p-0" showCloseButton={false}>
        {/* Left Column - Discount and Payment Mode */}
        <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('payment.title')}</h2>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="p-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Discount Section (conditional) */}
          {storePosProfile?.enable_discount === 1 && (
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Percent className="w-5 h-5" />
                {t('payment.apply_discount')}
              </h3>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={t('payment.discount_placeholder')}
                  size="sm"
                  className="flex-1"
                />
                <Button
                  onClick={handleApplyDiscount}
                  variant="default"
                  size="sm"
                >
                  {t('common.apply')}
                </Button>
              </div>
            </div>
          )}

          {/* Payment Methods Section - Split Payment */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold">{t('payment.payment_methods')}</h3>
            <div className="grid grid-cols-1 gap-2">
              {modeOptions.map(({ id, label }) => {
                const isSelected = selectedModes.includes(id);
                const isBalancing = id === balancingMode;
                return (
                  <label
                    key={id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-2 cursor-pointer transition-colors',
                      isSelected ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMode(id)}
                      disabled={isProcessing}
                      className="w-4 h-4 accent-primary-600 cursor-pointer"
                      aria-label={label}
                    />
                    <span className="w-24 font-medium truncate" title={label}>{label}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={isSelected ? inputValueFor(id) : ''}
                        onChange={e => handleAmountChange(id, e.target.value)}
                        onFocus={e => e.target.select()}
                        placeholder={t('payment.amount_placeholder')}
                        className="flex-1"
                        size="sm"
                        disabled={isProcessing || !isSelected}
                      />
                      {isBalancing && selectedModes.length > 1 && (
                        <span className="text-[10px] uppercase tracking-wide text-primary-600 font-semibold">
                          {t('payment.auto')}
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="font-medium">{t('payment.total_entered')}</span>
              <span className={'text-green-600 font-semibold flex items-center gap-1'}>
                {formatCurrency(paymentsTotal)} / {formatCurrency(finalTotal)}
                {paymentsTotal > finalTotal && (
                  <span className="text-yellow-700 font-semibold">
                    <Coins className="inline w-4 h-4 ml-1 text-yellow-500" />
                    <span className="text-yellow-500 font-bold ml-1">{formatCurrency(paymentsTotal - finalTotal)}</span>
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column - Order Summary and Pay Button */}
        <div className="md:w-1/2 p-6 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Order Summary */}
          <div className="space-y-3 mb-6">
            <h3 className="text-lg font-semibold">{t('payment.order_summary')}</h3>
            <div className="space-y-2 text-sm">
              {/* Subtotal (Grand Total) */}
              <div className="flex justify-between">
                <span className="text-gray-600">{t('payment.subtotal')}</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {/* Discount */}
              {appliedDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t('payment.discount')}</span>
                  <span>-{formatCurrency(appliedDiscount)}</span>
                </div>
              )}
              {/* Adjustment (if any) */}
              {showFinalAdjustment && (
                <div className="flex justify-between text-blue-600">
                  <span>{t('payment.adjustment')}</span>
                  <span>{roundedFinalAdjustment > 0 ? '+' : ''}{formatCurrency(roundedFinalAdjustment)}</span>
                </div>
              )}
              {/* Final Total (Rounded) */}
              <div className="border-t pt-2">
                <div className="flex justify-between font-semibold text-lg">
                  <span>{t('payment.total')}</span>
                  <span>{formatCurrency(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Button */}
          <Button
            onClick={handlePayment}
            disabled={isProcessing || payments.length === 0}
            variant={isProcessing || payments.length === 0 ? "secondary" : "default"}
            className="w-full"
          >
            {isProcessing ? t('payment.processing') : t('payment.pay_button', { amount: formatCurrency(paymentsTotal > 0 ? paymentsTotal : finalTotal) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog; 