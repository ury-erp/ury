/**
 * Wastage API utilities for URY POS
 */

import { call } from './frappe-sdk';

export interface WastageItem {
  item_code: string;
  item_name?: string;
  qty: number;
  uom?: string;
  batch_no?: string;
  serial_no?: string;
  reason?: string;
  row_name?: string;
}

export interface MarkWastePayload {
  items: WastageItem[];
  pos_invoice?: string;
  company: string;
  source_warehouse: string;
  waste_warehouse?: string;
  expense_account: string;
  cost_center: string;
  auto_submit?: boolean;
  remarks?: string;
  posting_date?: string;
  posting_time?: string;
  wastage_mode?: 'full' | 'partial';
}

export interface MarkWasteResponse {
  wastage_note: string;
  stock_entry: string;
  status: string;
  invoice_action?: 'modified' | 'cancelled';
}

export interface WastageDefaults {
  company?: string;
  source_warehouse?: string;
  expense_account?: string;
  cost_center?: string;
}

export interface ItemStockInfo {
  item_code: string;
  warehouse: string;
  qty_available: number;
  batches: Array<{
    batch_no: string;
    expiry_date?: string;
    qty: number;
  }>;
}

export interface OfflineWastageJob {
  action: 'mark_waste';
  payload: MarkWastePayload;
  timestamp: string;
  job_id: string;
}

/**
 * Mark items as waste
 */
export const markItemsWaste = async (payload: MarkWastePayload): Promise<MarkWasteResponse> => {
  try {
    const response = await call.post(
      'ury.ury.doctype.wastage_note.wastage_note.mark_items_waste',
      { payload: JSON.stringify(payload) }
    );
    return response.message;
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
};

/**
 * Process an offline wastage job
 */
export const processOfflineJob = async (job: OfflineWastageJob): Promise<MarkWasteResponse & { status: string }> => {
  try {
    const response = await call.post(
      'ury.ury.doctype.wastage_note.wastage_note.process_offline_job',
      { job: JSON.stringify(job) }
    );
    return response.message;
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
};

/**
 * Get default values for wastage note creation
 */
export const getWastageDefaults = async (company?: string, posProfile?: string): Promise<WastageDefaults> => {
  try {
    const response = await call.get(
      'ury.ury.doctype.wastage_note.wastage_note.get_wastage_defaults',
      { company, pos_profile: posProfile }
    );
    return response.message;
  } catch (error: any) {
    console.error('Failed to get wastage defaults:', error);
    return {};
  }
};

/**
 * Get stock information for an item including batches
 */
export const getItemStockInfo = async (itemCode: string, warehouse: string): Promise<ItemStockInfo> => {
  try {
    const response = await call.get(
      'ury.ury.doctype.wastage_note.wastage_note.get_item_stock_info',
      { item_code: itemCode, warehouse }
    );
    return response.message;
  } catch (error: any) {
    console.error('Failed to get item stock info:', error);
    return {
      item_code: itemCode,
      warehouse,
      qty_available: 0,
      batches: []
    };
  }
};

// Offline Queue Management
const WASTAGE_QUEUE_KEY = 'wastage_offline_queue';

/**
 * Generate a unique job ID
 */
const generateJobId = (): string => {
  return `wastage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get offline queue from localStorage
 */
export const getOfflineQueue = (): OfflineWastageJob[] => {
  try {
    const queue = localStorage.getItem(WASTAGE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch {
    return [];
  }
};

/**
 * Save offline queue to localStorage
 */
const saveOfflineQueue = (queue: OfflineWastageJob[]): void => {
  localStorage.setItem(WASTAGE_QUEUE_KEY, JSON.stringify(queue));
};

/**
 * Add a wastage job to the offline queue
 */
export const queueWastageJob = (payload: MarkWastePayload): OfflineWastageJob => {
  const job: OfflineWastageJob = {
    action: 'mark_waste',
    payload,
    timestamp: new Date().toISOString(),
    job_id: generateJobId()
  };

  const queue = getOfflineQueue();
  queue.push(job);
  saveOfflineQueue(queue);

  return job;
};

/**
 * Remove a job from the offline queue
 */
export const removeFromQueue = (jobId: string): void => {
  const queue = getOfflineQueue();
  const filtered = queue.filter(job => job.job_id !== jobId);
  saveOfflineQueue(filtered);
};

/**
 * Clear the entire offline queue
 */
export const clearOfflineQueue = (): void => {
  localStorage.removeItem(WASTAGE_QUEUE_KEY);
};

/**
 * Process all offline jobs and sync with server
 */
export const syncOfflineQueue = async (): Promise<{
  processed: number;
  failed: number;
  results: Array<{ job_id: string; status: string; error?: string }>
}> => {
  const queue = getOfflineQueue();
  const results: Array<{ job_id: string; status: string; error?: string }> = [];
  let processed = 0;
  let failed = 0;

  for (const job of queue) {
    try {
      const result = await processOfflineJob(job);

      if (result.status === 'success' || result.status === 'already_processed') {
        removeFromQueue(job.job_id);
        processed++;
        results.push({ job_id: job.job_id, status: result.status });
      } else {
        failed++;
        results.push({ job_id: job.job_id, status: 'failed', error: 'Unknown error' });
      }
    } catch (error: any) {
      failed++;
      results.push({
        job_id: job.job_id,
        status: 'failed',
        error: error.message || 'Unknown error'
      });
    }
  }

  return { processed, failed, results };
};

/**
 * Check if there are pending offline jobs
 */
export const hasPendingJobs = (): boolean => {
  return getOfflineQueue().length > 0;
};

/**
 * Get count of pending offline jobs
 */
export const getPendingJobCount = (): number => {
  return getOfflineQueue().length;
};
