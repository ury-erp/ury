/**
 * @file ConflictResolutionModal.tsx
 * @description Modal dialog allowing cashier to view, retry, or clear failed offline commands.
 */

import { useState, useEffect } from 'react';
import { Button } from '@ury/ui';
import { commandQueue, syncEngine, type CommandEnvelope } from '@ury/core';
import { AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConflictResolutionModal = ({ isOpen, onClose }: ConflictResolutionModalProps) => {
  const [failedCommands, setFailedCommands] = useState<CommandEnvelope[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFailed = async () => {
    try {
      const all = await commandQueue.getPendingCommands();
      // Filter for failed or max attempt commands
      const failed = all.filter(c => c.status === 'FAILED' || c.retryCount > 0);
      setFailedCommands(failed);
    } catch (err) {
      console.error('Failed to load conflict commands:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFailed();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRetryAll = async () => {
    setLoading(true);
    try {
      for (const cmd of failedCommands) {
        await commandQueue.enqueue({
          toEnvelope: () => ({
            ...cmd,
            status: 'PENDING',
            retryCount: 0,
          }),
        });
      }
      await syncEngine.triggerSync();
      await loadFailed();
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    await commandQueue.clearCompleted();
    await loadFailed();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Offline Sync Conflicts</h3>
              <p className="text-xs text-gray-600">Review and resolve commands that failed during sync replay.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-amber-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {failedCommands.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="font-medium">No unresolved conflicts found.</p>
              <p className="text-xs">All offline commands synced cleanly.</p>
            </div>
          ) : (
            failedCommands.map(cmd => (
              <div key={cmd.id} className="p-4 border border-red-200 rounded-md bg-red-50/50 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                    {cmd.actionName || cmd.endpoint}
                  </span>
                  <span className="text-xs text-gray-500">
                    ID: {cmd.id} | Retries: {cmd.retryCount}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-800">
                  Target: {cmd.endpoint}
                </p>
                {cmd.lastError && (
                  <div className="p-2 bg-red-100/80 rounded text-xs text-red-800 font-mono overflow-x-auto">
                    {cmd.lastError}
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-300 text-red-700 hover:bg-red-100"
                    onClick={() => handleRemove(cmd.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Discard Command
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {failedCommands.length > 0 && (
            <Button
              variant="default"
              size="sm"
              disabled={loading}
              onClick={handleRetryAll}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Retry All Sync Conflicts
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
