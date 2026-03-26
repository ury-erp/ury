import { call } from './frappe-sdk';

export interface MenuItem {
  item: string;
  item_name: string;
  item_image: string | null;
  rate: number | string;
  course: string;
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
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
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
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
}; 