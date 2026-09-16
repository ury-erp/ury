import { useCallback, useEffect, useState } from 'react';
import { workflowService, WorkflowStatus } from '../services/workflow';

const friendlyError = (err: unknown): string => {
  const message = err instanceof Error ? err.message : '';
  return message && /permitted|permission/i.test(message)
    ? "You don't have permission to make this change."
    : 'Unable to update this record. Please try again.';
};

export function useWorkflowStatus(doctype: string, name: string | null) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!name) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await workflowService.getStatus(doctype, name);
      setStatus(result);
    } catch (err) {
      setStatus(null);
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [doctype, name]);

  useEffect(() => {
    let cancelled = false;

    if (!name) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await workflowService.getStatus(doctype, name);
        if (!cancelled) setStatus(result);
      } catch (err) {
        if (!cancelled) {
          setStatus(null);
          setError(friendlyError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doctype, name]);

  const applyAction = useCallback(async (action: string) => {
    if (!name) return;
    setError(null);
    setApplying(true);
    try {
      const result = await workflowService.applyAction(doctype, name, action);
      setStatus((current) => (current ? { ...current, current_state: result.status } : current));
      await fetchStatus();
    } catch (err) {
      setError(friendlyError(err));
      throw err;
    } finally {
      setApplying(false);
    }
  }, [doctype, name, fetchStatus]);

  return { status, loading, error, applyAction, applying };
}
