/**
 * OAuth State Repository Implementation
 * Handles OAuth state storage using Redis for performance
 */

import { Redis } from 'ioredis';
import { IOAuthStateRepository } from '../../../application/interfaces/oauth-repository.interface';

interface OAuthStateData {
  provider: string;
  codeVerifier?: string;
  nonce?: string;
  redirectUri?: string;
  scopes?: string[];
}

export class OAuthStateRepository implements IOAuthStateRepository {
  private readonly keyPrefix = 'oauth:state:';

  constructor(private redis: Redis) {}

  /**
   * Store OAuth state information
   */
  async storeState(
    state: string,
    data: OAuthStateData,
    expiresIn: number
  ): Promise<void> {
    try {
      const key = this.getStateKey(state);
      const serializedData = JSON.stringify(data);

      await this.redis.setex(key, expiresIn, serializedData);
    } catch (error) {
      throw new Error(
        `Failed to store OAuth state: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve and delete OAuth state information
   */
  async consumeState(state: string): Promise<OAuthStateData | null> {
    try {
      const key = this.getStateKey(state);

      // Use pipeline to get and delete atomically
      const pipeline = this.redis.pipeline();
      pipeline.get(key);
      pipeline.del(key);

      const results = await pipeline.exec();

      if (!results || !results[0] || !results[0][1]) {
        return null;
      }

      const serializedData = results[0][1] as string;
      return JSON.parse(serializedData) as OAuthStateData;
    } catch (error) {
      throw new Error(
        `Failed to consume OAuth state: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clean up expired states
   */
  async cleanupExpiredStates(): Promise<number> {
    try {
      // Redis automatically handles TTL expiration, so this is mainly for monitoring
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);

      // Count how many keys exist (expired ones are already cleaned up by Redis)
      return keys.length;
    } catch (error) {
      throw new Error(
        `Failed to cleanup expired states: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get Redis key for OAuth state
   */
  private getStateKey(state: string): string {
    return `${this.keyPrefix}${state}`;
  }

  /**
   * Check if state exists
   */
  async stateExists(state: string): Promise<boolean> {
    try {
      const key = this.getStateKey(state);
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      throw new Error(
        `Failed to check state existence: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get state TTL
   */
  async getStateTTL(state: string): Promise<number> {
    try {
      const key = this.getStateKey(state);
      return await this.redis.ttl(key);
    } catch (error) {
      throw new Error(
        `Failed to get state TTL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get all active states (for debugging/monitoring)
   */
  async getAllActiveStates(): Promise<
    { state: string; data: OAuthStateData; ttl: number }[]
  > {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const pipeline = this.redis.pipeline();
      keys.forEach((key) => {
        pipeline.get(key);
        pipeline.ttl(key);
      });

      const results = await pipeline.exec();
      if (!results) {
        return [];
      }

      const states: { state: string; data: OAuthStateData; ttl: number }[] = [];

      for (let i = 0; i < keys.length; i++) {
        const dataResult = results[i * 2];
        const ttlResult = results[i * 2 + 1];

        if (dataResult && dataResult[1] && ttlResult && ttlResult[1]) {
          const state = keys[i].replace(this.keyPrefix, '');
          const data = JSON.parse(dataResult[1] as string) as OAuthStateData;
          const ttl = ttlResult[1] as number;

          states.push({ state, data, ttl });
        }
      }

      return states;
    } catch (error) {
      throw new Error(
        `Failed to get all active states: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
