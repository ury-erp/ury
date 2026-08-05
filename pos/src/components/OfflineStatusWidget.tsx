/**
 * @file OfflineStatusWidget.tsx
 * @description Offline & Sync Status header widget rendering Offline Badge, Pending Badge,
 * Sync Status, Conflict Badge, Sync Progress, Retry action, and Conflict Resolution launcher.
 */

import { useState, useEffect } from 'react';
import { commandQueue, syncEngine, projectionBus } from '@ury/core';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@ury/ui';
import { ConflictResolutionModal } from './ConflictResolutionModal';

export const OfflineStatusWidget = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [conflictCount, setConflictCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const refreshStatus = async () => {
    try {
      const pending = await commandQueue.countPending();
      const all = await commandQueue.getPendingCommands();
      const conflicts = all.filter(c => c.status === 'FAILED' || c.retryCount > 0).length;

      setPendingCount(pending);
      setConflictCount(conflicts);
      setIsSyncing(syncEngine.active);
    } catch (err) {
      console.error('Failed to refresh offline status widget:', err);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncEngine.triggerSync().then(refreshStatus);
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);

    const unsubscribe = projectionBus.subscribe(() => {
      refreshStatus();
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncEngine.triggerSync();
    await refreshStatus();
    setIsSyncing(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 bg-gray-100/80 px-3 py-1.5 rounded-full border border-gray-200 text-xs">
        {/* 1. Offline / Online Badge */}
        <div className="flex items-center gap-1.5 font-medium">
          {isOnline ? (
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
              <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              Offline Mode
            </span>
          )}
        </div>

        {/* 2. Pending Commands Badge */}
        {pendingCount > 0 && (
          <span className="flex items-center gap-1 bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
            {pendingCount} Pending
          </span>
        )}

        {/* 3. Conflict Badge */}
        {conflictCount > 0 && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1 bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full hover:bg-red-200 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            {conflictCount} Conflict{conflictCount > 1 ? 's' : ''}
          </button>
        )}

        {/* 4. Sync Progress / Status */}
        <div className="hidden sm:flex items-center gap-1 text-gray-600">
          {isSyncing ? (
            <span className="flex items-center gap-1 text-blue-600 font-medium animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Syncing Queue...
            </span>
          ) : pendingCount === 0 && conflictCount === 0 ? (
            <span className="flex items-center gap-1 text-gray-500">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Synced
            </span>
          ) : null}
        </div>

        {/* 5. Manual Sync / Retry Button */}
        {isOnline && (pendingCount > 0 || conflictCount > 0) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isSyncing}
            onClick={handleManualSync}
            className="h-6 px-2 text-xs text-blue-700 hover:bg-blue-100 rounded-md"
            title="Retry Sync Replay"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        )}

        {/* 6. Resolve Conflict Trigger */}
        {conflictCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="h-6 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50 rounded-md font-semibold"
          >
            Resolve Conflict
          </Button>
        )}
      </div>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
