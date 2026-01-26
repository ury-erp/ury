/**
 * OfflineSyncIndicator - Shows offline status and pending sync jobs
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Button } from './ui';
import { showToast } from './ui/toast';
import {
  hasPendingJobs,
  getPendingJobCount,
  syncOfflineQueue
} from '../lib/wastage-api';

interface OfflineSyncIndicatorProps {
  className?: string;
}

const OfflineSyncIndicator: React.FC<OfflineSyncIndicatorProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<'success' | 'partial' | 'failed' | null>(null);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      if (hasPendingJobs()) {
        handleSync();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check pending jobs periodically
  useEffect(() => {
    const checkPendingJobs = () => {
      setPendingCount(getPendingJobCount());
    };

    checkPendingJobs();
    const interval = setInterval(checkPendingJobs, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    if (!isOnline || isSyncing || pendingCount === 0) return;

    setIsSyncing(true);
    setLastSyncResult(null);

    try {
      const result = await syncOfflineQueue();

      if (result.failed === 0) {
        setLastSyncResult('success');
        showToast.success(t('wastage.syncComplete'));
      } else if (result.processed > 0) {
        setLastSyncResult('partial');
        showToast.warning(t('wastage.syncFailed'));
      } else {
        setLastSyncResult('failed');
        showToast.error(t('wastage.syncFailed'));
      }

      setPendingCount(getPendingJobCount());
    } catch (error) {
      setLastSyncResult('failed');
      showToast.error(t('wastage.syncFailed'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't show anything if online and no pending jobs
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Online/Offline indicator */}
      {!isOnline && (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-md text-sm">
          <WifiOff className="w-4 h-4" />
          <span className="hidden sm:inline">Offline</span>
        </div>
      )}

      {/* Pending jobs indicator */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-md text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{pendingCount} {t('wastage.pendingSync')}</span>
          </div>

          {isOnline && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
              className="h-8"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  {t('wastage.syncing')}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  {t('wastage.syncNow')}
                </>
              )}
            </Button>
          )}

          {/* Sync result indicator */}
          {lastSyncResult === 'success' && (
            <Check className="w-5 h-5 text-green-500" />
          )}
          {lastSyncResult === 'failed' && (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
        </div>
      )}
    </div>
  );
};

export default OfflineSyncIndicator;
