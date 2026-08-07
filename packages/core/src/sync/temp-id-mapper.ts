/**
 * @file temp-id-mapper.ts
 * @description Persistent Temp-ID to Server-ID Mapping Dictionary. Maps temporary client
 * UUIDs (e.g., TEMP-ORD-9912) to server document names (e.g., POS-INV-2026-00412) in IndexedDB.
 */

import { repositories, type StorageRepositories } from '../storage';

export class TempIDMapper {
  private static readonly METADATA_KEY = 'id_mappings';
  private memoryCache: Map<string, string> = new Map();
  private initialized = false;
  private repos: StorageRepositories;

  constructor(customRepos?: StorageRepositories) {
    this.repos = customRepos || repositories;
  }

  /**
   * Hydrates memoryCache from IndexedDB metadata repository
   */
  private async initCache(): Promise<void> {
    if (this.initialized) return;
    try {
      const rawJson = await this.repos.metadata.getValue(TempIDMapper.METADATA_KEY);
      if (rawJson) {
        const dict = JSON.parse(rawJson);
        Object.entries(dict).forEach(([k, v]) => {
          this.memoryCache.set(k, String(v));
        });
      }
    } catch (err) {
      console.error('[TempIDMapper] Failed to initialize from metadata:', err);
    } finally {
      this.initialized = true;
    }
  }

  /**
   * Registers a mapping between a Local Temp ID and a Server ID
   */
  async registerMapping(localId: string, serverId: string): Promise<void> {
    if (!localId || !serverId || localId === serverId) return;
    await this.initCache();
    this.memoryCache.set(localId, serverId);

    // Persist to metadata repository
    const dict: Record<string, string> = {};
    this.memoryCache.forEach((v, k) => {
      dict[k] = v;
    });
    await this.repos.metadata.setValue(TempIDMapper.METADATA_KEY, JSON.stringify(dict));
  }

  /**
   * Retrieves mapped Server ID for a given Local ID (or returns localId if unmapped)
   */
  async getServerId(localId: string): Promise<string> {
    await this.initCache();
    return this.memoryCache.get(localId) || localId;
  }

  /**
   * Recursively traverses a payload object and replaces any local temp IDs with mapped server IDs
   */
  async remapPayload<T = any>(payload: T): Promise<T> {
    await this.initCache();
    if (!payload || typeof payload !== 'object') return payload;

    if (Array.isArray(payload)) {
      const remappedArray = await Promise.all(payload.map(item => this.remapPayload(item)));
      return remappedArray as unknown as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload)) {
      if (typeof val === 'string' && this.memoryCache.has(val)) {
        result[key] = this.memoryCache.get(val);
      } else if (val && typeof val === 'object') {
        result[key] = await this.remapPayload(val);
      } else {
        result[key] = val;
      }
    }

    return result as T;
  }

  /**
   * Clear all mappings
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.initialized = false;
    await this.repos.metadata.setValue(TempIDMapper.METADATA_KEY, JSON.stringify({}));
  }
}

export const tempIDMapper = new TempIDMapper();
