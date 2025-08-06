/**
 * Generic Cache Interface
 * Defines the minimum cache interface that repository classes need
 */

import { CacheOptions } from '../cache/cache-entry';

export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  invalidatePattern(pattern: string): Promise<number>;
  getStats(): any;
  destroy?(): void;
}
