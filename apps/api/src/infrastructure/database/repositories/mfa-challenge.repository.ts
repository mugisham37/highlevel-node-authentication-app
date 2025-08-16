import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, lt, gt, sql } from 'drizzle-orm';
import { Logger } from 'winston';
import {
  mfaChallenges,
  MFAChallenge,
  NewMFAChallenge,
} from '../drizzle/schema/mfa-challenges';
import * as mfaChallengesSchema from '../drizzle/schema/mfa-challenges';

export interface MFAChallengeCreateData {
  id: string;
  type: 'totp' | 'sms' | 'email' | 'webauthn';
  userId: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  metadata?: Record<string, any>;
}

export class MFAChallengeRepository {
  constructor(
    private db: NodePgDatabase<typeof mfaChallengesSchema>,
    private logger: Logger
  ) {}

  async createChallenge(data: MFAChallengeCreateData): Promise<MFAChallenge> {
    try {
      const challengeData: NewMFAChallenge = {
        id: data.id,
        type: data.type,
        userId: data.userId,
        expiresAt: data.expiresAt,
        attempts: data.attempts,
        maxAttempts: data.maxAttempts,
        metadata: data.metadata,
        createdAt: new Date(),
      };

      const [challenge] = await this.db
        .insert(mfaChallenges)
        .values(challengeData)
        .returning();

      if (!challenge) {
        throw new Error('Failed to create MFA challenge');
      }

      this.logger.info('MFA challenge created successfully', {
        challengeId: challenge.id,
        type: challenge.type,
        userId: challenge.userId,
      });

      return challenge;
    } catch (error) {
      this.logger.error('Failed to create MFA challenge', { error, data });
      throw error;
    }
  }

  async findById(challengeId: string): Promise<MFAChallenge | null> {
    try {
      const [challenge] = await this.db
        .select()
        .from(mfaChallenges)
        .where(eq(mfaChallenges.id, challengeId))
        .limit(1);

      return challenge || null;
    } catch (error) {
      this.logger.error('Failed to find MFA challenge by ID', {
        error,
        challengeId,
      });
      throw error;
    }
  }

  async incrementAttempts(challengeId: string): Promise<void> {
    try {
      await this.db
        .update(mfaChallenges)
        .set({
          attempts: sql`${mfaChallenges.attempts} + 1`,
        })
        .where(eq(mfaChallenges.id, challengeId));

      this.logger.debug('MFA challenge attempts incremented', { challengeId });
    } catch (error) {
      this.logger.error('Failed to increment MFA challenge attempts', {
        error,
        challengeId,
      });
      throw error;
    }
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    try {
      await this.db
        .delete(mfaChallenges)
        .where(eq(mfaChallenges.id, challengeId));

      this.logger.debug('MFA challenge deleted', { challengeId });
    } catch (error) {
      this.logger.error('Failed to delete MFA challenge', {
        error,
        challengeId,
      });
      throw error;
    }
  }

  async cleanupExpiredChallenges(): Promise<number> {
    try {
      const result = await this.db
        .delete(mfaChallenges)
        .where(lt(mfaChallenges.expiresAt, new Date()));

      const count = result.rowCount || 0;
      if (count > 0) {
        this.logger.info('Expired MFA challenges cleaned up', { count });
      }

      return count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired MFA challenges', { error });
      throw error;
    }
  }

  async getUserActiveChallenges(userId: string): Promise<MFAChallenge[]> {
    try {
      const challenges = await this.db
        .select()
        .from(mfaChallenges)
        .where(
          and(
            eq(mfaChallenges.userId, userId),
            gt(mfaChallenges.expiresAt, new Date())
          )
        );

      return challenges;
    } catch (error) {
      this.logger.error('Failed to get user active MFA challenges', {
        error,
        userId,
      });
      throw error;
    }
  }
}
