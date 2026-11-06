import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRooms, getTables, getTableCount } from '../lib/table-api';
import { projectionBus } from '@ury/core';
import { queryClient } from '../lib/query-client';

const MASTER_DATA_STALE_TIME = 1000 * 60 * 60; // 1 hour for static rooms
const TABLE_OPERATIONAL_STALE_TIME = 1000 * 10; // 10 seconds for live table occupancy
const MASTER_DATA_GC_TIME = 1000 * 60 * 60 * 24; // 24 hours

export function useRooms(branch: string | null) {
  return useQuery({
    queryKey: ['rooms', branch || 'default'],
    queryFn: () => getRooms(branch),
    enabled: true,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnReconnect: true,
  });
}


export function useTables(room: string | null) {
  useEffect(() => {
    const unsubscribe = typeof projectionBus.on === 'function'
      ? projectionBus.on('TABLES_UPDATED', () => {
          queryClient.invalidateQueries({ queryKey: ['tables'] });
          queryClient.invalidateQueries({ queryKey: ['roomCounts'] });
        })
      : projectionBus.subscribe((event) => {
          if (event === 'TABLES_UPDATED' || event === 'ALL_UPDATED') {
            queryClient.invalidateQueries({ queryKey: ['tables'] });
            queryClient.invalidateQueries({ queryKey: ['roomCounts'] });
          }
        });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);


  return useQuery({
    queryKey: ['tables', room],
    queryFn: () => getTables(room!),
    enabled: !!room,
    staleTime: TABLE_OPERATIONAL_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
}

export function useRoomCounts(rooms: string[], branch: string | null) {
  return useQuery({
    queryKey: ['roomCounts', branch || 'default', (rooms || []).slice().sort().join(',')],
    queryFn: async () => {
      if (!branch || rooms.length === 0) return {};
      const counts = await Promise.all(
        rooms.map((room) => getTableCount(room, branch))
      );
      return rooms.reduce((acc, room, index) => {
        acc[room] = counts[index];
        return acc;
      }, {} as Record<string, number>);
    },
    enabled: !!branch && rooms.length > 0,
    staleTime: TABLE_OPERATIONAL_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
}


