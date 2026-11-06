import { useQuery } from '@tanstack/react-query';
import { getRestaurantMenu, getAggregatorMenu, MenuItem as APIMenuItem } from '../lib/menu-api';
import { usePOSStore, MenuItem } from '../store/pos-store';

const MENU_STALE_TIME = 1000 * 60 * 15; // 15 minutes
const MENU_GC_TIME = 1000 * 60 * 60 * 24; // 24 hours

export function getMenuQueryKey(
  posProfileName?: string | null,
  room?: string | null,
  orderType?: string | null,
  aggregatorCustomer?: string | null
) {
  return [
    'restaurantMenu',
    posProfileName ?? null,
    room ?? null,
    orderType ?? null,
    orderType === 'Aggregators' ? (aggregatorCustomer ?? null) : null,
  ] as const;
}

export function useMenu() {
  const { posProfile, selectedRoom, selectedOrderType, selectedAggregator } = usePOSStore();
  
  return useQuery({
    queryKey: getMenuQueryKey(
      posProfile?.name,
      selectedRoom,
      selectedOrderType,
      selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : null
    ),
    queryFn: async () => {
      if (!posProfile?.name) return [];
      
      let items: APIMenuItem[] = [];
      if (selectedOrderType === 'Aggregators' && selectedAggregator?.customer) {
        items = await getAggregatorMenu(selectedAggregator.customer);
      } else {
        items = await getRestaurantMenu(posProfile.name, selectedRoom, selectedOrderType);
      }

      const menuItems: MenuItem[] = items.map((item: APIMenuItem) => ({
        id: item.item,
        name: item.item_name,
        image: item.item_image || null,
        price: typeof item.rate === 'string' ? parseFloat(item.rate) : item.rate || 0,
        item: item.item,
        item_name: item.item_name,
        item_image: item.item_image,
        course: item.course,
        course_label: item.course_label || item.course,
        description: item.description || '',
        special_dish: item.special_dish || 0,
        tax_rate: 0,
        variants: item.variants?.map(v => ({
          ...v,
          price: typeof v.price === 'string' ? parseFloat(v.price) : v.price
        })) || [],
        addons: item.addons?.map(a => ({
          ...a,
          price: typeof a.price === 'string' ? parseFloat(a.price) : a.price
        })) || [],
      }));

      return menuItems;
    },
    enabled: !!posProfile?.name,
    staleTime: MENU_STALE_TIME,
    gcTime: MENU_GC_TIME,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

