/**
 * WastageDialog - Modal for marking items or invoices as waste
 *
 * Two modes accessible via tabs:
 *   "Waste Single Item" – pick one invoice line, enter partial qty
 *   "Waste Entire Invoice" – confirm waste of all items (full cancellation)
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, AlertCircle, Package, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui';
import { Textarea } from './ui/textarea';
import { Spinner } from './ui/spinner';
import { showToast } from './ui/toast';
import {
  markItemsWaste,
  getWastageDefaults,
  getItemStockInfo,
  queueWastageJob,
  WastageItem,
  MarkWastePayload,
  WastageDefaults,
  ItemStockInfo
} from '../lib/wastage-api';
import { usePOSStore } from '../store/pos-store';
import { cn } from '../lib/utils';

interface WastageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceItems: Array<{
    name: string;
    item_code: string;
    item_name: string;
    qty: number;
    uom?: string;
  }>;
  onSuccess?: (result: { wastage_note: string; stock_entry?: string; invoice_action?: string }) => void;
}

const WastageDialog: React.FC<WastageDialogProps> = ({
  isOpen,
  onClose,
  invoiceId,
  invoiceItems,
  onSuccess
}) => {
  const { t } = useTranslation();
  const { posProfile } = usePOSStore();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<WastageDefaults>({});
  const [stockInfo, setStockInfo] = useState<ItemStockInfo | null>(null);

  // Mode tabs
  const [wastageMode, setWastageMode] = useState<'item' | 'invoice'>('item');

  // Form state for single item mode
  const [selectedRowName, setSelectedRowName] = useState<string>('');
  const [wasteQty, setWasteQty] = useState<string>('1');
  const [itemReason, setItemReason] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');

  // Form state for invoice/bulk wastage
  const [bulkReason, setBulkReason] = useState<string>('');

  // Get the currently selected item from invoiceItems
  const selectedItem = invoiceItems.find(i => i.name === selectedRowName);

  // Load defaults on open
  useEffect(() => {
    if (isOpen) {
      loadDefaults();
    }
  }, [isOpen]);

  // Load stock info when item selection changes
  useEffect(() => {
    if (isOpen && selectedItem) {
      loadStockInfo(selectedItem.item_code);
    }
  }, [isOpen, selectedRowName]);

  const loadDefaults = async () => {
    try {
      const company = posProfile?.company;
      const posProfileName = posProfile?.name;
      const result = await getWastageDefaults(company, posProfileName);
      setDefaults(result);
    } catch (err) {
      console.error('Failed to load wastage defaults:', err);
    }
  };

  const loadStockInfo = async (itemCode: string) => {
    if (!defaults.source_warehouse && !posProfile?.warehouse) return;

    try {
      const warehouse = defaults.source_warehouse || posProfile?.warehouse || '';
      const info = await getItemStockInfo(itemCode, warehouse);
      setStockInfo(info);

      // Auto-select first batch if available
      if (info.batches.length > 0) {
        setSelectedBatch(info.batches[0].batch_no);
      } else {
        setSelectedBatch('');
      }
    } catch (err) {
      console.error('Failed to load stock info:', err);
    }
  };

  const handleClose = () => {
    setError(null);
    setWastageMode('item');
    setSelectedRowName('');
    setWasteQty('1');
    setItemReason('');
    setBulkReason('');
    setSelectedBatch('');
    setStockInfo(null);
    onClose();
  };

  const validateForm = (): boolean => {
    // Check required defaults
    if (!defaults.company && !posProfile?.company) {
      setError(t('wastage.missingCompany'));
      return false;
    }
    if (!defaults.source_warehouse && !posProfile?.warehouse) {
      setError(t('wastage.missingWarehouse'));
      return false;
    }
    if (!defaults.expense_account) {
      setError(t('wastage.missingExpenseAccount'));
      return false;
    }
    if (!defaults.cost_center) {
      setError(t('wastage.missingCostCenter'));
      return false;
    }

    if (wastageMode === 'item') {
      if (!selectedRowName) {
        setError(t('wastage.selectItemFirst'));
        return false;
      }
      const qtyNum = parseFloat(wasteQty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setError(t('wastage.invalidQty'));
        return false;
      }
      if (selectedItem && qtyNum > selectedItem.qty) {
        setError(t('wastage.qtyExceedsAvailable'));
        return false;
      }
    }

    return true;
  };

  const buildPayload = (): MarkWastePayload => {
    const company = defaults.company || posProfile?.company || '';
    const sourceWarehouse = defaults.source_warehouse || posProfile?.warehouse || '';
    const expenseAccount = defaults.expense_account || '';
    const costCenter = defaults.cost_center || posProfile?.cost_center || '';

    let items: WastageItem[] = [];

    if (wastageMode === 'item' && selectedItem) {
      items = [{
        item_code: selectedItem.item_code,
        item_name: selectedItem.item_name,
        qty: parseFloat(wasteQty),
        uom: selectedItem.uom,
        batch_no: selectedBatch || undefined,
        reason: itemReason || undefined,
        row_name: selectedItem.name,
      }];
    } else {
      // Invoice mode: all items
      items = invoiceItems.map(i => ({
        item_code: i.item_code,
        item_name: i.item_name,
        qty: i.qty,
        uom: i.uom,
        reason: bulkReason || 'Marked as waste from invoice',
        row_name: i.name,
      }));
    }

    return {
      items,
      pos_invoice: invoiceId,
      company,
      source_warehouse: sourceWarehouse,
      expense_account: expenseAccount,
      cost_center: costCenter,
      auto_submit: true,
      remarks: wastageMode === 'invoice' ? bulkReason : itemReason,
      wastage_mode: wastageMode === 'item' ? 'partial' : 'full',
    };
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    const payload = buildPayload();

    try {
      // Check if online
      if (navigator.onLine) {
        const result = await markItemsWaste(payload);
        showToast.success(t('wastage.successMessage', { note: result.wastage_note }));
        onSuccess?.({
          wastage_note: result.wastage_note,
          stock_entry: result.stock_entry,
          invoice_action: result.invoice_action,
        });
        handleClose();
      } else {
        // Queue for offline processing
        const job = queueWastageJob(payload);
        showToast.info(t('wastage.queuedOffline'));
        onSuccess?.({ wastage_note: `Queued: ${job.job_id}` });
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || t('wastage.failedToProcess'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent variant="default" showCloseButton onClose={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            {t('wastage.markAsWaste')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Invoice Info Header */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-900">
              {t('wastage.invoice')}: {invoiceId}
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              className={cn(
                "flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors",
                wastageMode === 'item'
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
              onClick={() => setWastageMode('item')}
            >
              {t('wastage.wasteSingleItem')}
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors",
                wastageMode === 'invoice'
                  ? "border-red-500 text-red-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
              onClick={() => setWastageMode('invoice')}
            >
              {t('wastage.wasteEntireInvoice')}
            </button>
          </div>

          {/* Mode: Waste Single Item */}
          {wastageMode === 'item' && (
            <>
              {/* Item Selector - radio list */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t('wastage.selectItem')}
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  {invoiceItems.map((item) => (
                    <label
                      key={item.name}
                      className={cn(
                        "flex items-center p-3 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50",
                        selectedRowName === item.name && "bg-orange-50"
                      )}
                    >
                      <input
                        type="radio"
                        name="waste-item"
                        value={item.name}
                        checked={selectedRowName === item.name}
                        onChange={() => {
                          setSelectedRowName(item.name);
                          setWasteQty(item.qty.toString());
                          setError(null);
                        }}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        <p className="text-xs text-gray-500">
                          {t('wastage.qty')}: {item.qty} {item.uom}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Quantity to waste */}
              {selectedItem && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      {t('wastage.wasteQty')}
                    </label>
                    <input
                      type="number"
                      value={wasteQty}
                      onChange={(e) => setWasteQty(e.target.value)}
                      min="0.01"
                      max={selectedItem.qty}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {/* Batch selector */}
                  {stockInfo && stockInfo.batches.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        {t('wastage.selectBatch')}
                      </label>
                      <select
                        value={selectedBatch}
                        onChange={(e) => setSelectedBatch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">{t('wastage.noBatch')}</option>
                        {stockInfo.batches.map((batch) => (
                          <option key={batch.batch_no} value={batch.batch_no}>
                            {batch.batch_no} - {t('wastage.qty')}: {batch.qty}
                            {batch.expiry_date && ` - ${t('wastage.expiry')}: ${batch.expiry_date}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Reason Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      {t('wastage.reason')}
                    </label>
                    <Textarea
                      value={itemReason}
                      onChange={(e) => setItemReason(e.target.value)}
                      placeholder={t('wastage.reasonPlaceholder')}
                      rows={2}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Mode: Waste Entire Invoice */}
          {wastageMode === 'invoice' && (
            <>
              {/* Warning banner */}
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm font-medium">
                  {t('wastage.entireInvoiceWarning')}
                </p>
              </div>

              {/* All items summary (read-only) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t('wastage.itemsToWaste')} ({invoiceItems.length})
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {invoiceItems.map((i) => (
                    <div
                      key={i.name}
                      className="p-2 border-b border-gray-100 last:border-b-0"
                    >
                      <p className="text-sm font-medium">{i.item_name}</p>
                      <p className="text-xs text-gray-500">
                        {i.qty} {i.uom}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bulk Reason Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t('wastage.reason')}
                </label>
                <Textarea
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder={t('wastage.bulkReasonPlaceholder')}
                  rows={3}
                />
              </div>
            </>
          )}

          {/* Offline Indicator */}
          {!navigator.onLine && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-yellow-600" />
              <p className="text-yellow-700 text-sm">
                {t('wastage.offlineWarning')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Spinner className="w-4 h-4" hideMessage />
                {t('wastage.processing')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                {wastageMode === 'item'
                  ? t('wastage.confirmWasteItem')
                  : t('wastage.confirmWasteInvoice')}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WastageDialog;
