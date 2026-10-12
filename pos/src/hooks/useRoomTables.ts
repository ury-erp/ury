import { useCallback, useEffect, useRef, useState } from 'react';
import { getTables, type Table } from '../lib/table-api';
import { sortTablesByMergeGroups } from '../lib/table-utils';
import { t } from '../i18n';

/** A cache must not be an effect dependency: each response would fetch again. */
export function useRoomTables(room: string | null, branch: string | null) {
  const cache = useRef<Record<string, Table[]>>({});
  const request = useRef(0);
  const pending = useRef(false);
  const activeRoom = useRef(room);
  const activeBranch = useRef(branch);
  activeRoom.current = room;
  activeBranch.current = branch;
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadTables = useCallback(async (
    roomName: string | null,
    _options?: { useCache?: boolean },
  ) => {
    if (!roomName || !branch || roomName !== activeRoom.current) return;
    const id = ++request.current;
    pending.current = true;
    // Cached rows are only a preview; every call still goes to the server.
    const cached = cache.current[roomName];
    setTables(cached ?? []);
    setError(null);
    setLoading(!cached);
    setRefreshing(!!cached);
    try {
      const rows = sortTablesByMergeGroups(await getTables(roomName));
      if (activeBranch.current !== branch) return;
      // A slower response for the previous room must never replace this one.
      if (id !== request.current || activeRoom.current !== roomName) return;
      cache.current[roomName] = rows;
      setTables(rows);
      setLastUpdated(new Date());
    } catch {
      if (id !== request.current || activeRoom.current !== roomName) return;
      setError(t('errors.failed_load_tables'));
    } finally {
      if (id === request.current) {
        pending.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [branch]);

  useEffect(() => {
    cache.current = {};
    request.current++;
    pending.current = false;
    setTables([]);
    setLastUpdated(null);
    setError(null);
  }, [branch]);

  useEffect(() => {
    setLastUpdated(null);
    if (room && branch) void loadTables(room);
    else {
      setTables([]);
      setLoading(false);
      setRefreshing(false);
    }
    return () => { request.current++; pending.current = false; };
  }, [room, branch, loadTables]);

  useEffect(() => {
    const refreshVisibleRoom = () => {
      if (document.visibilityState !== 'hidden' && !pending.current) {
        void loadTables(activeRoom.current);
      }
    };
    window.addEventListener('focus', refreshVisibleRoom);
    window.addEventListener('online', refreshVisibleRoom);
    document.addEventListener('visibilitychange', refreshVisibleRoom);
    const timer = window.setInterval(refreshVisibleRoom, 30_000);
    return () => {
      window.removeEventListener('focus', refreshVisibleRoom);
      window.removeEventListener('online', refreshVisibleRoom);
      document.removeEventListener('visibilitychange', refreshVisibleRoom);
      window.clearInterval(timer);
    };
  }, [loadTables]);

  return { tables, loading, refreshing, error, lastUpdated, loadTables };
}
