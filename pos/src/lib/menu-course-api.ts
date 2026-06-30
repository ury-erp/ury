import { call } from './frappe-sdk-retry';

export interface MenuCourse {
  name: string;
  label: string;
}

export interface MenuCourseResponse {
  message: MenuCourse[];
}


export async function getMenuCourses(): Promise<MenuCourse[]> {
  const response = await call.get<MenuCourseResponse>(
    'ury.ury_pos.api.getMenuCourses'
  );
  return response.message;
}