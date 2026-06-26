import { call } from './frappe-sdk';
import { getErrorMessage } from './error-utils';

export interface MenuCourse {
  name: string;
  label: string;
}

export interface MenuCourseResponse {
  message: MenuCourse[];
}


export async function getMenuCourses(): Promise<MenuCourse[]> {
  try {
    const response = await call.get<MenuCourseResponse>(
      'ury.ury_pos.api.getMenuCourses'
    );
    return response.message;
  } catch (error) {
    throw new Error(`Failed to fetch menu courses: ${getErrorMessage(error)}`);
  }
}