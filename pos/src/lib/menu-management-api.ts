import { call } from './frappe-sdk-retry';
import { db } from './frappe-sdk-retry';

// ---- Types ----

export interface URYMenuItem {
  name: string;
  item: string;
  item_name: string;
  rate: number;
  special_dish: number;
  disabled: number;
  course: string | null;
  course_icon: string | null;
  idx: number;
}

export interface URYMenu {
  name: string;
  enabled: number;
  branch: string;
  price_list: string;
  items: URYMenuItem[];
  item_count: number;
  enabled_count: number;
}

export interface URYMenuCourse {
  name: string;
  course: string;
  custom_serving_priority: number;
  custom_indicate_in_kds: number;
}

export interface AvailableItem {
  name: string;
  item_name: string;
  item_group: string;
  standard_rate: number;
  image: string | null;
}

// ---- API Functions ----

export async function getMenus(): Promise<URYMenu[]> {
  const response = await call.get<{ message: URYMenu[] }>(
    'ury.ury.api.ury_menu_management.get_menus'
  );
  return response.message;
}

export async function getMenuDetail(menuName: string): Promise<URYMenu> {
  const response = await call.get<{ message: URYMenu }>(
    'ury.ury.api.ury_menu_management.get_menu_detail',
    { menu_name: menuName }
  );
  return response.message;
}

export async function createMenu(branch: string, enabled: number = 1): Promise<string> {
  const response = await call.post<{ message: string }>(
    'ury.ury.api.ury_menu_management.create_menu',
    { branch, enabled }
  );
  return response.message;
}

export async function toggleMenu(menuName: string, enabled: number): Promise<{ name: string; enabled: number }> {
  const response = await call.post<{ message: { name: string; enabled: number } }>(
    'ury.ury.api.ury_menu_management.toggle_menu',
    { menu_name: menuName, enabled }
  );
  return response.message;
}

export async function addMenuItem(
  menuName: string,
  item: string,
  rate: number,
  course?: string | null,
  specialDish?: number
): Promise<{ success: boolean; item: string; item_name: string }> {
  const response = await call.post<{
    message: { success: boolean; item: string; item_name: string };
  }>(
    'ury.ury.api.ury_menu_management.add_menu_item',
    { menu_name: menuName, item, rate, course, special_dish: specialDish || 0 }
  );
  return response.message;
}

export async function updateMenuItem(
  menuName: string,
  itemRowName: string,
  updates: {
    rate?: number;
    special_dish?: number;
    disabled?: number;
    course?: string;
  }
): Promise<{ success: boolean }> {
  const response = await call.post<{ message: { success: boolean } }>(
    'ury.ury.api.ury_menu_management.update_menu_item',
    { menu_name: menuName, item_row_name: itemRowName, ...updates }
  );
  return response.message;
}

export async function removeMenuItem(
  menuName: string,
  itemRowName: string
): Promise<{ success: boolean }> {
  const response = await call.post<{ message: { success: boolean } }>(
    'ury.ury.api.ury_menu_management.remove_menu_item',
    { menu_name: menuName, item_row_name: itemRowName }
  );
  return response.message;
}

export async function batchUpdatePrices(
  menuName: string,
  updates: Array<{ item_row_name: string; rate: number }>
): Promise<{ success: boolean; updated_count: number }> {
  const response = await call.post<{
    message: { success: boolean; updated_count: number };
  }>(
    'ury.ury.api.ury_menu_management.batch_update_prices',
    { menu_name: menuName, updates: JSON.stringify(updates) }
  );
  return response.message;
}

export async function getCoursesDetail(): Promise<URYMenuCourse[]> {
  const response = await call.get<{ message: URYMenuCourse[] }>(
    'ury.ury.api.ury_menu_management.get_courses_detail'
  );
  return response.message;
}

export async function createMenuCourse(
  course: string,
  servingPriority: number = 0,
  indicateInKds: number = 0
): Promise<string> {
  const response = await call.post<{ message: string }>(
    'ury.ury.api.ury_menu_management.create_menu_course',
    { course, serving_priority: servingPriority, indicate_in_kds: indicateInKds }
  );
  return response.message;
}

export async function updateMenuCourse(
  courseName: string,
  updates: {
    course?: string;
    serving_priority?: number;
    indicate_in_kds?: number;
  }
): Promise<{ success: boolean }> {
  const response = await call.post<{ message: { success: boolean } }>(
    'ury.ury.api.ury_menu_management.update_menu_course',
    { course_name: courseName, ...updates }
  );
  return response.message;
}

export async function deleteMenuCourse(
  courseName: string
): Promise<{ success: boolean }> {
  const response = await call.post<{ message: { success: boolean } }>(
    'ury.ury.api.ury_menu_management.delete_menu_course',
    { course_name: courseName }
  );
  return response.message;
}

export async function getAvailableItems(): Promise<AvailableItem[]> {
  const response = await call.get<{ message: AvailableItem[] }>(
    'ury.ury.api.ury_menu_management.get_available_items'
  );
  return response.message;
}
