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

  async findByCategory(category: string): Promise<MenuItemEntity[]> {
    return this.table.where('category').equals(category).toArray();
  }
}
