import { useQuery } from '@tanstack/react-query';
import { getMenuCourses } from '../lib/menu-course-api';
import { getPaymentModes } from '../lib/payment-api';
import { getAggregators } from '../lib/aggregator-api';
import { usePOSStore } from '../store/pos-store';

const MASTER_DATA_STALE_TIME = 1000 * 60 * 60; // 1 hour
const MASTER_DATA_GC_TIME = 1000 * 60 * 60 * 24; // 24 hours

export function useCategories() {
  const { posProfile } = usePOSStore();
  return useQuery({
    queryKey: ['categories', posProfile?.name],
    queryFn: async () => {
      const courses = await getMenuCourses();
      return [
        { name: '', label: 'All' },
        ...courses.map((course: any) => ({
          name: course.name,
          label: course.course_name || course.name,
        }))
      ];
    },
    enabled: !!posProfile?.name,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnReconnect: true,
  });
}

export function usePaymentModes() {
  const { posProfile } = usePOSStore();
  return useQuery({
    queryKey: ['paymentModes', posProfile?.name],
    queryFn: async () => {
      if (!posProfile?.name) return ['Cash'];
      return await getPaymentModes();
    },
    enabled: !!posProfile?.name,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnReconnect: true,
  });
}

export function useAggregators() {
  const { posProfile } = usePOSStore();
  return useQuery({
    queryKey: ['aggregators', posProfile?.name],
    queryFn: async () => {
      if (!posProfile?.name) return [];
      return await getAggregators(posProfile.name);
    },
    enabled: !!posProfile?.name,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnReconnect: true,
  });
}

