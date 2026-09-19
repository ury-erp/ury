import { call } from '@ury/core';

export interface MenuCourse {
  name: string;
  label: string;
  icon?: string;
}

export interface MenuCourseResponse {
  message: MenuCourse[];
}


export async function getMenuCourses(
  posProfile: string,
  room: string | null,
  orderType: string | null
): Promise<MenuCourse[]> {
  const response = await call.get<MenuCourseResponse>(
    'ury.ury_pos.api.getMenuCourses',
    {
      pos_profile: posProfile,
      room: room,
      order_type: orderType
    }
  );
  return response.message;
}