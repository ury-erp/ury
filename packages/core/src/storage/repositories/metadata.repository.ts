/**
 * @file metadata.repository.ts
 * @description CRUD Repository implementation for 'metadata' collection.
 */

import { BaseRepository } from './base.repository';
import type { MetadataEntity, IMetadataRepository } from '../types';
import type { UryPosDatabase } from '../db';

export class MetadataRepository
  extends BaseRepository<MetadataEntity, string>
  implements IMetadataRepository
{
  constructor(dbInstance: UryPosDatabase) {
    super(dbInstance.metadata, dbInstance);
  }

  /** Get metadata value string by key */
  async getValue(key: string): Promise<string | null> {
    const record = await this.getById(key);
    return record ? record.value : null;
  }

  /** Set metadata key-value record */
  async setValue(key: string, value: string): Promise<string> {
    return this.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  }
}
