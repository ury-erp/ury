import { call, apiRegistry, repositories } from '@ury/core';

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
  variants?: Array<{ name: string; price: number | string }>;
  addons?: Array<{ name: string; price: number | string; category?: string }>;
}

export interface GetMenuResponse {
  message: {
    items: MenuItem[];
  };
}

export interface GetAggregatorMenuResponse {
  message: MenuItem[];
}

function mapMenuItemToEntity(item: MenuItem): import('@ury/core').MenuItemEntity {
  return {
    id: item.item,
    item_name: item.item_name,
    rate: item.rate,
    course: item.course,
    course_label: item.course_label,
    special_dish: item.special_dish,
    item_image: item.item_image,
    image: item.item_image,
    description: item.description,
    variants: item.variants,
    addons: item.addons,
  };
}

function mapEntityToMenuItem(entity: import('@ury/core').MenuItemEntity): MenuItem {
  return {
    item: entity.id,
    item_name: entity.item_name,
    item_image: entity.item_image ?? entity.image ?? null,
    rate: entity.rate,
    course: entity.course ?? '',
    course_label: entity.course_label,
    description: entity.description,
    special_dish: entity.special_dish,
    variants: entity.variants,
    addons: entity.addons,
  };
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
    await repositories.menu.putMany(items.map(mapMenuItemToEntity));
    return items;
  } catch (error) {
    const cached = await repositories.menu.getAll();
    if (cached.length > 0) {
      return cached.map(mapEntityToMenuItem);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Offline: unable to load restaurant menu. ${reason}`);
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
    await repositories.menu.putMany(items.map(mapMenuItemToEntity));
    return items;
  } catch (error) {
    const cached = await repositories.menu.getAll();
    if (cached.length > 0) {
      return cached.map(mapEntityToMenuItem);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Offline: unable to load aggregator menu. ${reason}`);
  }
};
