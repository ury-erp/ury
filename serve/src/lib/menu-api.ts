import { call } from '@ury/core';

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
  disabled?: 1 | 0;
}

export interface GetMenuResponse {
  message: {
    items: MenuItem[];
  };
}

export interface GetAggregatorMenuResponse {
  message: MenuItem[];
}

/** Re-throw the first Frappe `_server_messages` payload, else rethrow as-is. */
function rethrowFrappeServerMessage(error: unknown): never {
  if (error && typeof error === 'object' && '_server_messages' in error) {
    const raw = (error as { _server_messages?: unknown })._server_messages;
    if (raw) {
      const messages = JSON.parse(raw as string) as string[];
      const message = JSON.parse(messages[0]) as { message?: string };
      throw new Error(message.message);
    }
  }
  throw error;
}

export const getRestaurantMenu = async (posProfile: string, room: string | null, order_type: string | null) => {
  try {
    const response = await call.get<GetMenuResponse>(
      'ury.ury_pos.api.getRestaurantMenu',
      {
        pos_profile: posProfile,
        room: room,
        order_type: order_type
      }
    );
    return response.message.items;
  } catch (error: unknown) {
    rethrowFrappeServerMessage(error);
  }
};

export const getAggregatorMenu = async (aggregator: string) => {
  try {
    const response = await call.get<GetAggregatorMenuResponse>(
      'ury.ury_pos.api.getAggregatorItem',
      {
        aggregator
      }
    );
    return response.message;
  } catch (error: unknown) {
    rethrowFrappeServerMessage(error);
  }
}; 