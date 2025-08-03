/**
 * OAuth Authorization Code Repository Implementation
 * Handles authorization code storage using Redis for performance
 */

import { Redis } from 'ioredis';
import { IOAuthAuthorizationCodeRepository } from '../../../application/interfaces/oauth-repository.interface';

interface AuthorizationCodeData {
  clientId: string;
  userId: string;
  scopes: string[];
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export class OAuthAuthorizationCodeRepository
  implements IOAuthAuthorizationCodeRepository
{
  private readonly keyPrefix = 'oauth:code:';
  private readonly usedKeyPrefix = 'oauth:code:used:';

  constructor(private redis: Redis) {}

  /**
   * Store authorization code
   */
  async storeCode(
    code: string,
    data: AuthorizationCodeData,
    expiresIn: number
  ): Promise<void> {
    try {
      const key = this.getCodeKey(code);
      const serializedData = JSON.stringify(data);

      await this.redis.setex(key, expiresIn, serializedData);
    } catch (error) {
      throw new Error(
        `Failed to store authorization code: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve and mark authorization code as used
   */
  async consumeCode(code: string): Promise<AuthorizationCodeData | null> {
    try {
      const key = this.getCodeKey(code);
      const usedKey = this.getUsedCodeKey(code);

      // Check if code was already used
      const isUsed = await this.redis.exists(usedKey);
      if (isUsed) {
        return null;
      }

      // Get the code data
      const serializedData = await this.redis.get(key);
      if (!serializedData) {
        return null;
      }

      // Mark as used and delete original
      const pipeline = this.redis.pipeline();
      pipeline.setex(usedKey, 3600, '1'); // Mark as used for 1 hour
      pipeline.del(key); // Delete original code

      await pipeline.exec();

      return JSON.parse(serializedData) as AuthorizationCodeData;
    } catch (error) {
      throw new Error(
        `Failed to consume authorization code: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if authorization code exists and is valid
   */
  async isCodeValid(code: string): Promise<boolean> {
    try {
      const key = this.getCodeKey(code);
      const usedKey = this.getUsedCodeKey(code);

      // Check if code exists and is not used
      const pipeline = this.redis.pipeline();
      pipeline.exists(key);
      pipeline.exists(usedKey);

      const results = await pipeline.exec();

      if (!results) {
        return false;
      }

      const codeExists = results[0][1] === 1;
      const codeUsed = results[1][1] === 1;

      return codeExists && !codeUsed;
    } catch (error) {
      throw new Error(
        `Failed to check code validity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clean up expired authorization codes
   */
  async cleanupExpiredCodes(): Promise<number> {
    try {
      // Redis automatically handles TTL expiration, so this is mainly for monitoring
      const codePattern = `${this.keyPrefix}*`;
      const usedPattern = `${this.usedKeyPrefix}*`;

      const pipeline = this.redis.pipeline();
      pipeline.keys(codePattern);
      pipeline.keys(usedPattern);

      const results = await pipeline.exec();

      if (!results) {
        return 0;
      }

      const activeCodeKeys = results[0][1] as string[];
      const usedCodeKeys = results[1][1] as string[];

      return activeCodeKeys.length + usedCodeKeys.length;
    } catch (error) {
      throw new Error(
        `Failed to cleanup expired codes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get Redis key for authorization code
   */
  private getCodeKey(code: string): string {
    return `${this.keyPrefix}${code}`;
  }

  /**
   * Get Redis key for used authorization code
   */
  private getUsedCodeKey(code: string): string {
    return `${this.usedKeyPrefix}${code}`;
  }

  /**
   * Get authorization code data without consuming it
   */
  async getCodeData(code: string): Promise<AuthorizationCodeData | null> {
    try {
      const key = this.getCodeKey(code);
      const usedKey = this.getUsedCodeKey(code);

      // Check if code was already used
      const isUsed = await this.redis.exists(usedKey);
      if (isUsed) {
        return null;
      }

      const serializedData = await this.redis.get(key);
      if (!serializedData) {
        return null;
      }

      return JSON.parse(serializedData) as AuthorizationCodeData;
    } catch (error) {
      throw new Error(
        `Failed to get code data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get code TTL
   */
  async getCodeTTL(code: string): Promise<number> {
    try {
      const key = this.getCodeKey(code);
      return await this.redis.ttl(key);
    } catch (error) {
      throw new Error(
        `Failed to get code TTL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Revoke authorization code manually
   */
  async revokeCode(code: string): Promise<void> {
    try {
      const key = this.getCodeKey(code);
      const usedKey = this.getUsedCodeKey(code);

      const pipeline = this.redis.pipeline();
      pipeline.del(key);
      pipeline.setex(usedKey, 3600, '1'); // Mark as used for 1 hour

      await pipeline.exec();
    } catch (error) {
      throw new Error(
        `Failed to revoke authorization code: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get all active authorization codes (for debugging/monitoring)
   */
  async getAllActiveCodes(): Promise<
    { code: string; data: AuthorizationCodeData; ttl: number }[]
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

      const codes: {
        code: string;
        data: AuthorizationCodeData;
        ttl: number;
      }[] = [];

      for (let i = 0; i < keys.length; i++) {
        const dataResult = results[i * 2];
        const ttlResult = results[i * 2 + 1];

        if (dataResult && dataResult[1] && ttlResult && ttlResult[1]) {
          const code = keys[i].replace(this.keyPrefix, '');
          const data = JSON.parse(
            dataResult[1] as string
          ) as AuthorizationCodeData;
          const ttl = ttlResult[1] as number;

          codes.push({ code, data, ttl });
        }
      }

      return codes;
    } catch (error) {
      throw new Error(
        `Failed to get all active codes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
