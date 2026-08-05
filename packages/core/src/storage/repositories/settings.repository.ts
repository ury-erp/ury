/**
 * @file settings.repository.ts
 * @description CRUD Repository implementation for 'settings' collection.
 */

import { BaseRepository } from './base.repository';
import type { SettingsEntity, ISettingsRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class SettingsRepository
  extends BaseRepository<SettingsEntity, string>
  implements ISettingsRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.settings, dbInstance);
  }

  /** Get deserialized setting value by key */
  async getSetting<V = unknown>(key: string): Promise<V | null> {
    const record = await this.getById(key);
    return record ? (record.value as V) : null;
  }

  /** Store setting value by key */
  async setSetting<V = unknown>(key: string, value: V): Promise<string> {
    return this.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  }
}
