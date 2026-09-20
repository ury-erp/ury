import React, { useState, useEffect, useRef } from 'react';
import { X, Percent, Coins } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency, call, parseFrappeError } from '@ury/core';
import { Button, Input, Dialog, DialogContent, DialogTitle, showToast, Spinner } from '@ury/ui';
import { DEFAULT_PAYMENT_MODE } from '../data/order-types';
import { t } from '../i18n';
import { guardOnline } from '../lib/offline-guard';
import { useConnectivity } from '../lib/connectivity';
import { getCustomerLoyalty, maxRedeemablePoints, type CustomerLoyalty } from '../lib/loyalty-api';
import { paymentDiscountPercentage } from '../lib/payment-amounts';


interface PaymentDialogProps {
  onClose: () => void;
  grandTotal: number;
  roundedTotal: number;
  invoice: string;
  customer: string;
  posProfile: string;
  table: string | null;
  tableLabel?: string | null;
  cashier: string;
  owner: string;
  fetchOrders: () => Promise<void>;
  clearSelectedOrder: () => void;
  discountPercentage?: number;
  discountAmount?: number;
}

const PaymentDialog: React.FC<PaymentDialogProps> = ({
  onClose,
  grandTotal,
  roundedTotal,
  invoice,
  customer,
  posProfile,
  table,
  tableLabel,
  cashier,
  owner,
  fetchOrders,
  clearSelectedOrder,
  discountPercentage,
  discountAmount
}) => {
  const { paymentModes, fetchPaymentModes, posProfile: storePosProfile } = usePOSStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentInFlight = useRef(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [appliedPercentage, setAppliedPercentage] = useState(discountPercentage || 0);
  const [preview, setPreview] = useState<{ grand_total: number; rounded_total: number; discount_amount: number } | null>(null);
  
  // Calculate effective percentage if only amount is provided (for invoice-level discounts)
  const effectivePercentage = discountPercentage 
    ? discountPercentage 
    : (discountAmount && grandTotal + discountAmount > 0 
        ? (discountAmount / (grandTotal + discountAmount)) * 100 
        : 0);
        
  const [discountValue, setDiscountValue] = useState<string>(effectivePercentage > 0 ? String(effectivePercentage) : '');
  const [appliedDiscount, setAppliedDiscount] = useState<number>(discountAmount || 0); // Only tracking transaction discount!
  const [paymentInputs, setPaymentInputs] = useState<{ [mode: string]: string }>({});

  useEffect(() => {
    fetchPaymentModes();
  }, [fetchPaymentModes]);

  // baseTotal represents the amount before any invoice-level discount (like pricing rule or manual discount)
  const baseTotal = grandTotal + (discountAmount || 0);

  const handleApplyDiscount = async () => {
    if (isProcessing || isPreviewing) return;
    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      setError(t('errors.invalid_discount'));
      return;
    }
    if (value > 100) {
      setError(t('errors.discount_exceeds_max'));
      return;
    }
    setIsPreviewing(true);
    setError(null);
    try {
      const response = await call.post('ury.ury.api.payment_preview.preview_payment', {
        invoice, pos_profile: posProfile, additionalDiscount: paymentDiscountPercentage(value),
      });
      const quote = response.message;
      if (!quote || ![quote.grand_total, quote.rounded_total, quote.discount_amount].every(Number.isFinite)) {
        throw new Error(t('payment.preview_failed'));
      }
      setPreview(quote);
      setAppliedPercentage(value);
      setAppliedDiscount(quote.discount_amount);
      // Any previously typed amounts belonged to the old quote.
      setPaymentInputs({});
    } catch (err) {
      setError(parseFrappeError(err, t('payment.preview_failed')));
    } finally {
      setIsPreviewing(false);
    }
  };

  // Order summary logic
  const subtotal = preview ? preview.grand_total + preview.discount_amount : baseTotal;
  const discountedTotal = preview?.grand_total ?? grandTotal;
  // Keep the server's rounding/decimal precision; never round money again here.
  const finalTotal = preview?.rounded_total ?? (roundedTotal || grandTotal);

  // Calculate split payment total
  const payments = paymentModes
    .map((mode: any) => {
      const id = typeof mode === 'string' ? mode : mode.id;
      const amount = parseFloat(paymentInputs[id] || '');
      return amount > 0 ? { mode_of_payment: id, amount } : null;
    })
    .filter(Boolean);
  const paymentsTotal = payments.reduce((sum, p: any) => sum + p.amount, 0);
  const shortfall = finalTotal - paymentsTotal;
  const isShort = shortfall > 0.005;

  const finalAdjustment = finalTotal - discountedTotal;
  const roundedFinalAdjustment = Math.round(finalAdjustment * 100) / 100;
  const showFinalAdjustment = Math.abs(roundedFinalAdjustment) > 0.001;

  useEffect(()=>{
    const defaultPaymentModePresent=paymentModes.find((mode)=>mode===DEFAULT_PAYMENT_MODE)
    //only one payment mode should be present, then autofill the final amount, if not do not fill
    const otherPaymentModesNotEntered=Object.keys(paymentInputs).length<=1;
    if(finalTotal && paymentModes && DEFAULT_PAYMENT_MODE && defaultPaymentModePresent && otherPaymentModesNotEntered){
      //check if default payment mode is present in paymentModes
      setPaymentInputs((prev)=>({ 
        ...prev,
        [DEFAULT_PAYMENT_MODE]:String(finalTotal) 
      }))
    }
  },[finalTotal,paymentModes])

  // Helper to calculate remaining balance
  const getRemainingBalance = (currentId: string) => {
    const totalEntered = Object.entries(paymentInputs)
      .filter(([id]) => id !== currentId)
      .reduce((sum, [_, val]) => sum + (parseFloat(val) || 0), 0);
    return Math.max(0, finalTotal - totalEntered);
  };

  // Handler for input focus to auto-fill remaining balance
  const handlePaymentInputFocus = (id: string) => {
    setPaymentInputs(inputs => {
      // Only auto-fill if the field is empty or zero
      if (!inputs[id] || parseFloat(inputs[id]) === 0) {
        const remaining = getRemainingBalance(id);
        return { ...inputs, [id]: remaining > 0 ? String(remaining) : '' };
      }
      return inputs;
    });
  };

  /**
   * Collects the amount.
   *
   * The dialog cannot be dismissed while this is in flight. Closing it used
   * to be possible by Escape, by the backdrop, or by the X — and the request
   * carried on regardless, so the cashier lost the only place the result was
   * going to be reported and had no way to tell a completed settlement from
   * a failed one. The honest options at that point are to ask the guest to
   * pay again or to go hunting in the order list; both are worse than
   * waiting (UX-03).
   *
   * Retrying is safe on the server side: `make_invoice` serialises callers
   * on the invoice row and answers an already-settled bill with its existing
   * settlement instead of collecting twice.
   */
  const { isOffline } = useConnectivity();

  const [loyalty, setLoyalty] = useState<CustomerLoyalty | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);

  // Looked up per customer, not cached across them: the balance changes on
  // every settled bill, and showing a stale one invites a cashier to promise
  // a discount the server will then refuse.
  useEffect(() => {
    let cancelled = false;
    setPointsToRedeem(0);
    if (!customer) {
      setLoyalty(null);
      return;
    }
    getCustomerLoyalty(customer, posProfile).then((result) => {
      if (!cancelled) setLoyalty(result);
    });
    return () => {
      cancelled = true;
    };
  }, [customer, posProfile]);

  const maxPoints = loyalty ? maxRedeemablePoints(loyalty, finalTotal) : 0;
  const redeemValue = loyalty ? pointsToRedeem * loyalty.conversion_factor : 0;

  const handlePayment = async () => {
    if (paymentInFlight.current || isPreviewing || isShort || !Number.isFinite(finalTotal) || finalTotal < 0) return;
    // Checked here rather than only on the button: the connection can drop
    // between the cashier deciding to press it and the press landing.
    if (!guardOnline()) return;
    paymentInFlight.current = true;
    setIsProcessing(true);
    setError(null);
    try {
      await call.post('ury.ury.doctype.ury_order.ury_order.make_invoice', {
        additionalDiscount: paymentDiscountPercentage(appliedPercentage),
        cashier,
        customer,
        invoice,
        owner,
        payments,
        pos_profile: posProfile,
        table,
        redeem_loyalty_points: pointsToRedeem || undefined,
      });
      showToast.success(t('payment.success', { amount: formatCurrency(paymentsTotal) }));
      onClose();
      clearSelectedOrder();
      await fetchOrders();
    } catch (err) {
      console.error('Payment failed:', err);
      // parseFrappeError extracts human-readable message from _server_messages (e.g. stock validation error)
      setError(parseFrappeError(err, t('errors.payment_failed')));
    } finally {
      paymentInFlight.current = false;
      setIsProcessing(false);
    }
  };

  // Every dismissal route goes through here, so none of them can bypass the
  // in-flight guard the way three separate handlers previously did.
  const handleDismiss = () => {
    if (paymentInFlight.current) return;
    onClose();
  };

  return (
    <Dialog
      open={true}
      onOpenChange={handleDismiss}
      closeOnEscape={!isProcessing}
      closeOnBackdrop={!isProcessing}
    >
      <DialogContent variant="xlarge" className="bg-white w-full max-w-4xl max-h-dialog-max-h flex flex-col md:flex-row p-0" showCloseButton={false}>
        {/* Left Column - Discount and Payment Mode */}
        <div className="md:w-1/2 p-6 border-b md:border-b-0 md:border-e border-gray-200 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <DialogTitle className="text-2xl font-bold text-gray-900">{t('payment.title')}</DialogTitle>
            <Button
              onClick={handleDismiss}
              disabled={isProcessing}
              aria-label={t('common.close')}
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
                  aria-label={t('payment.apply_discount')}
                  disabled={isProcessing || isPreviewing}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={t('payment.discount_placeholder')}
                  size="sm"
                  className="flex-1"
                />
                <Button
                  onClick={handleApplyDiscount}
                  loading={isPreviewing}
                  disabled={isProcessing}
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
            <div className="grid grid-cols-1 gap-3">
              {paymentModes.map((mode: any) => {
                const id = typeof mode === 'string' ? mode : mode.id;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <label htmlFor={`payment-mode-${id}`} className="w-24 font-medium">{typeof mode === 'string' ? mode : mode.name}</label>
                    <Input
                      id={`payment-mode-${id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentInputs[id] || ''}
                      onChange={e => setPaymentInputs(inputs => ({ ...inputs, [id]: e.target.value }))}
                      onFocus={() => handlePaymentInputFocus(id)}
                      placeholder={t('payment.amount_placeholder')}
                      className="flex-1"
                      size="sm"
                      disabled={isProcessing || isPreviewing}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-sm">
              <span className="font-medium">{t('payment.total_entered')}</span>
              <span className={`${isShort ? 'text-amber-700' : 'text-green-600'} font-semibold flex items-center gap-1`}>
                {formatCurrency(paymentsTotal)} / {formatCurrency(finalTotal)}
                {paymentsTotal > finalTotal && (
                  <span className="text-yellow-700 font-semibold">
                    <Coins className="inline w-4 h-4 ms-1 text-yellow-500" />
                    <span className="text-yellow-500 font-bold ms-1">{formatCurrency(paymentsTotal - finalTotal)}</span>
                  </span>
                )}
              </span>
            </div>
            {isShort && (
              <p role="status" className="text-amber-700 text-sm font-medium">
                {t('payment.short_by', { amount: formatCurrency(shortfall) })}
              </p>
            )}
            {paymentsTotal > finalTotal && (
              <p className="text-yellow-700 text-sm font-medium">
                {t('payment.change_due', { amount: formatCurrency(paymentsTotal - finalTotal) })}
              </p>
            )}
          </div>
        </div>

        {/* Right Column - Order Summary and Pay Button */}
        <div className="md:w-1/2 p-6 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* In-flight state. Persistent and announced, rather than only a
              relabelled button: while this is showing, the dialog refuses to
              close, so the cashier is told why it will not go away. */}
          {isProcessing && (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3"
            >
              <Spinner className="mt-0.5 h-4 w-4 shrink-0" hideMessage message={t('payment.processing')} />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  {t('payment.processing_title', { amount: formatCurrency(paymentsTotal) })}
                </p>
                <p className="text-xs text-blue-800">{t('payment.processing_hint')}</p>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="space-y-3 mb-6">
            <h3 className="text-lg font-semibold">{t('payment.order_summary')}</h3>
            {tableLabel && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('tables.table_name')}</span>
                <span className="font-medium">{tableLabel}</span>
              </div>
            )}
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

          {/* Loyalty. Shown only when the customer actually has points to
              spend: an empty balance is noise between a cashier and the
              Pay button, and the accrual half needs no interface at all. */}
          {loyalty?.enrolled && loyalty.loyalty_points > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-amber-900">
                  {t('payment.loyalty_balance', {
                    points: loyalty.loyalty_points,
                    amount: formatCurrency(loyalty.redeemable_amount),
                  })}
                </span>
                {loyalty.tier_name && (
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {loyalty.tier_name}
                  </span>
                )}
              </div>

              {maxPoints > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={maxPoints}
                    value={pointsToRedeem || ''}
                    placeholder={t('payment.points_to_redeem')}
                    onChange={(e) => {
                      // Clamped here as well as on the server: ERPNext
                      // refuses a redemption worth more than the bill, and
                      // discovering that at submit means the guest is already
                      // waiting with a card in their hand.
                      const raw = parseInt(e.target.value, 10);
                      setPointsToRedeem(Number.isFinite(raw) ? Math.max(0, Math.min(raw, maxPoints)) : 0);
                    }}
                    className="h-9 w-32"
                  />
                  <button
                    type="button"
                    onClick={() => setPointsToRedeem(maxPoints)}
                    className="rounded-md bg-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-300"
                  >
                    {t('payment.redeem_max')}
                  </button>
                  {pointsToRedeem > 0 && (
                    <span className="text-sm font-semibold text-amber-900">
                      −{formatCurrency(redeemValue)}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-amber-800">{t('payment.bill_too_small_to_redeem')}</p>
              )}
            </div>
          )}

          {/* Payment Button */}
          <Button
            onClick={handlePayment}
            disabled={isOffline || isProcessing || isPreviewing || (payments.length === 0 && finalTotal > 0) || isShort}
            title={isOffline ? t('offline.blocked') : undefined}
            variant="default"
            className="w-full"
          >
            {isProcessing ? t('payment.processing') : t('payment.pay_button', { amount: formatCurrency(finalTotal) })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog; 