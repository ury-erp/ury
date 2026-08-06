import { call, repositories, apiRegistry } from '@ury/core';

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
  try {
    const response = await call.get<GetMenuResponse>(
      endpoint,
      {
        pos_profile: posProfile,
        room: room,
        order_type: order_type
      }
    );
    const items = response.message.items;

    // Cache into local menu repository
    if (items && items.length > 0) {
      await repositories.menu.putMany(
        items.map(i => ({
          id: i.item,
          item_name: i.item_name,
          rate: typeof i.rate === 'number' ? i.rate : parseFloat(i.rate) || 0,
          category: i.course || 'General',
          course: i.course || null,
          special_dish: i.special_dish,
          image: i.item_image,
        }))
      );
    }

    return items;
  } catch (error: any) {
    // Offline repository fallback
    const cachedItems = await repositories.menu.getAll();
    if (cachedItems && cachedItems.length > 0) {
      return cachedItems.map(c => ({
        item: c.id,
        item_name: c.item_name,
        item_image: c.image || null,
        rate: c.rate,
        course: c.course || '',
        course_label: c.course || '',
        special_dish: c.special_dish,
      }));
    }

    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
};

export const getAggregatorMenu = async (aggregator: string) => {
  const endpoint = apiRegistry.getUrl('GET_AGGREGATOR_ITEM');
  try {
    const response = await call.get<GetAggregatorMenuResponse>(
      endpoint,
      {
        aggregator
      }
    );
    const items = response.message;

    if (items && items.length > 0) {
      await repositories.aggregatorItems.putManyByAggregator(
        aggregator,
        items.map(i => ({
          item: i.item,
          item_name: i.item_name,
          rate: typeof i.rate === 'number' ? i.rate : parseFloat(i.rate) || 0,
          item_image: i.item_image,
        }))
      );
    }

    return items;
  } catch (error: any) {
    const cachedItems = await repositories.aggregatorItems.findByAggregator(aggregator);
    if (cachedItems && cachedItems.length > 0) {
      return cachedItems.map(c => ({
        item: c.item,
        item_name: c.item_name,
        item_image: c.item_image || null,
        rate: c.rate,
        course: '',
        course_label: '',
      }));
    }

    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
};