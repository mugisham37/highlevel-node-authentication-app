/**
 * OAuth User Repository Implementation
 * Handles user data persistence for OAuth operations
 */

import { PrismaClient } from '../../../generated/prisma/client';
import { IOAuthUserRepository } from '../../../application/interfaces/oauth-repository.interface';
import { User } from '../../../domain/entities/user';
import { Email } from '../../../domain/value-objects/email';
import { Password } from '../../../domain/value-objects/password';

export class OAuthUserRepository implements IOAuthUserRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find user by email address
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const userData = await this.prisma.user.findUnique({
        where: { email },
        include: {
          accounts: true,
        },
      });

      if (!userData) {
        return null;
      }

      return this.mapToUser(userData);
    } catch (error) {
      throw new Error(
        `Failed to find user by email: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find user by OAuth provider account
   */
  async findByProviderAccount(
    provider: string,
    providerAccountId: string
  ): Promise<User | null> {
    try {
      const userData = await this.prisma.user.findFirst({
        where: {
          accounts: {
            some: {
              provider,
              providerAccountId,
            },
          },
        },
        include: {
          accounts: true,
        },
      });

      if (!userData) {
        return null;
      }

      return this.mapToUser(userData);
    } catch (error) {
      throw new Error(
        `Failed to find user by provider account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create new user
   */
  async create(user: User): Promise<User> {
    try {
      const userData = await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email.value,
          emailVerified: user.emailVerified || null,
          name: user.name || null,
          image: user.image || null,
          passwordHash: user.password?.hash || null,
          mfaEnabled: user.mfaEnabled,
          totpSecret: user.totpSecret || null,
          backupCodes: user.backupCodes,
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil || null,
          lastLoginAt: user.lastLoginAt || null,
          lastLoginIP: user.lastLoginIP || null,
          riskScore: user.riskScore,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        include: {
          accounts: true,
        },
      });

      return this.mapToUser(userData);
    } catch (error) {
      throw new Error(
        `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update existing user
   */
  async update(user: User): Promise<User> {
    try {
      const userData = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.email.value,
          emailVerified: user.emailVerified || null,
          name: user.name || null,
          image: user.image || null,
          passwordHash: user.password?.hash || null,
          mfaEnabled: user.mfaEnabled,
          totpSecret: user.totpSecret || null,
          backupCodes: user.backupCodes,
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil || null,
          lastLoginAt: user.lastLoginAt || null,
          lastLoginIP: user.lastLoginIP || null,
          riskScore: user.riskScore,
          updatedAt: new Date(),
        },
        include: {
          accounts: true,
        },
      });

      return this.mapToUser(userData);
    } catch (error) {
      throw new Error(
        `Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete user
   */
  async delete(userId: string): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id: userId },
      });
    } catch (error) {
      throw new Error(
        `Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Map Prisma user data to User domain entity
   */
  private mapToUser(userData: any): User {
    return new User({
      id: userData.id,
      email: new Email(userData.email),
      emailVerified: userData.emailVerified,
      name: userData.name,
      image: userData.image,
      password: userData.passwordHash
        ? new Password(userData.passwordHash, true)
        : undefined,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      mfaEnabled: userData.mfaEnabled,
      totpSecret: userData.totpSecret,
      backupCodes: userData.backupCodes || [],
      failedLoginAttempts: userData.failedLoginAttempts,
      lockedUntil: userData.lockedUntil,
      lastLoginAt: userData.lastLoginAt,
      lastLoginIP: userData.lastLoginIP,
      riskScore: userData.riskScore,
    });
  }
}
