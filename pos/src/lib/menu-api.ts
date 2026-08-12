import { call, apiRegistry } from '@ury/core';

export interface MenuItem {
  item: string;
  item_name: string;
  item_image: string | null;
  rate: number | string;
  course: string;
  course_label?: string;
  trending?: boolean;
  popular?: boolean;
  recommended?: boolean;
  description?: string;
  special_dish?: 1 | 0;
}

export interface GetMenuResponse {
  message: {
    items: MenuItem[];
  };
}

export interface GetAggregatorMenuResponse {
  message: MenuItem[];
}

export const getRestaurantMenu = async (posProfile: string, room: string | null, order_type: string | null) => {
  const endpoint = apiRegistry.getUrl('GET_RESTAURANT_MENU');
  const response = await call.get<GetMenuResponse>(
    endpoint,
    {
      pos_profile: posProfile,
      room: room,
      order_type: order_type
    }
  );
  return response.message.items;
};

export const getAggregatorMenu = async (aggregator: string) => {
  const endpoint = apiRegistry.getUrl('GET_AGGREGATOR_ITEM');
  const response = await call.get<GetAggregatorMenuResponse>(
    endpoint,
    {
      aggregator
    }
  );
  return response.message;
};
