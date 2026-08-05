/**
 * @file menu.repository.ts
 * @description CRUD Repository implementation for 'menu' collection.
 */

import { BaseRepository } from './base.repository';
import type { MenuItemEntity, IMenuRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class MenuRepository
  extends BaseRepository<MenuItemEntity, string>
  implements IMenuRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.menu, dbInstance);
  }

  /** Find menu items by category */
  async findByCategory(category: string): Promise<MenuItemEntity[]> {
    return this.table.where('category').equals(category).toArray();
  }

  /** Find all special dishes */
  async findSpecials(): Promise<MenuItemEntity[]> {
    return this.table.where('special_dish').equals(1).toArray();
  }
}
