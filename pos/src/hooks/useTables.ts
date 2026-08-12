import { useQuery } from '@tanstack/react-query';
import { getRooms, getTables, getTableCount } from '../lib/table-api';

const MASTER_DATA_STALE_TIME = 1000 * 60 * 60; // 1 hour
const MASTER_DATA_GC_TIME = 1000 * 60 * 60 * 24; // 24 hours

export function useRooms(branch: string | null) {
  return useQuery({
    queryKey: ['rooms', branch],
    queryFn: () => getRooms(branch!),
    enabled: !!branch,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });
}

export function useTables(room: string | null) {
  return useQuery({
    queryKey: ['tables', room],
    queryFn: () => getTables(room!),
    enabled: !!room,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });
}

export function useRoomCounts(rooms: string[], branch: string | null) {
  return useQuery({
    queryKey: ['roomCounts', branch, rooms],
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
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });
}
