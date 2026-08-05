/**
 * @file menu.projection.ts
 * @description Menu Projection Engine. Computes UI-ready menu data models from repositories.
 */

import { repositories, type MenuItemEntity } from '../storage';
import { projectionBus } from './projection.bus';

export interface MenuProjectionItem {
  id: string;
  name: string;
  price: number;
  category: string;
  course: string | null;
  image: string | null;
  special_dish: boolean;
}

export interface MenuProjectionData {
  items: MenuProjectionItem[];
  categories: string[];
  courses: string[];
  specialsCount: number;
  totalCount: number;
}

/**
 * Computes and returns the Menu Projection read model from repositories.
 */
export async function getMenuProjection(categoryFilter?: string, repos = repositories): Promise<MenuProjectionData> {
  const rawItems: MenuItemEntity[] = await repos.menu.getAll();

  const items: MenuProjectionItem[] = rawItems.map((item: MenuItemEntity) => ({
    id: item.id,
    name: item.item_name,
    price: item.rate,
    category: item.category || 'General',
    course: item.course || null,
    image: item.image || null,
    special_dish: item.special_dish === 1,
  }));

  const filteredItems = categoryFilter && categoryFilter !== 'all'
    ? items.filter(i => i.category.toLowerCase() === categoryFilter.toLowerCase() || i.course?.toLowerCase() === categoryFilter.toLowerCase())
    : items;

  const categories = Array.from(new Set(items.map(i => i.category))).sort();
  const courses = Array.from(new Set(items.map(i => i.course).filter(Boolean) as string[])).sort();
  const specialsCount = items.filter(i => i.special_dish).length;

  return {
    items: filteredItems,
    categories,
    courses,
    specialsCount,
    totalCount: items.length,
  };
}

/**
 * Updates menu projection and notifies subscribers.
 */
export async function updateMenuProjection(items: MenuProjectionItem[], repos = repositories): Promise<void> {
  if (items && items.length > 0) {
    await repos.menu.putMany(
      items.map(i => ({
        id: i.id,
        item_name: i.name,
        rate: i.price,
        category: i.category,
        course: i.course,
        special_dish: i.special_dish ? 1 : 0,
        image: i.image,
      }))
    );
  }
  projectionBus.emit('MENU_UPDATED');
}
