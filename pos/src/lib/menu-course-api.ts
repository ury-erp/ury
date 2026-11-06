import { call, apiRegistry } from '@ury/core';

export interface MenuCourse {
  name: string;
  label: string;
  icon?: string;
}

export interface MenuCourseResponse {
  message: MenuCourse[];
}

export async function getMenuCourses(): Promise<MenuCourse[]> {
  const endpoint = apiRegistry.getUrl('GET_MENU_COURSES');
  const response = await call.get<MenuCourseResponse>(endpoint);
  return response.message;
}