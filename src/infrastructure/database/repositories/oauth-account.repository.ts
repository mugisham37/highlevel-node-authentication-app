/**
 * OAuth Account Repository Implementation
 * Handles OAuth account data persistence
 */

import { PrismaClient } from '../../../generated/prisma/client';
import { IOAuthAccountRepository } from '../../../application/interfaces/oauth-repository.interface';
import { Account } from '../../../domain/entities/account';

export class OAuthAccountRepository implements IOAuthAccountRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Find account by user ID and provider
   */
  async findByUserAndProvider(
    userId: string,
    provider: string
  ): Promise<Account | null> {
    try {
      const accountData = await this.prisma.account.findFirst({
        where: {
          userId,
          provider,
        },
      });

      if (!accountData) {
        return null;
      }

      return this.mapToAccount(accountData);
    } catch (error) {
      throw new Error(
        `Failed to find account by user and provider: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find account by provider and provider account ID
   */
  async findByProviderAccount(
    provider: string,
    providerAccountId: string
  ): Promise<Account | null> {
    try {
      const accountData = await this.prisma.account.findFirst({
        where: {
          provider,
          providerAccountId,
        },
      });

      if (!accountData) {
        return null;
      }

      return this.mapToAccount(accountData);
    } catch (error) {
      throw new Error(
        `Failed to find account by provider account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find all accounts for a user
   */
  async findByUserId(userId: string): Promise<Account[]> {
    try {
      const accountsData = await this.prisma.account.findMany({
        where: { userId },
      });

      return accountsData.map((accountData) => this.mapToAccount(accountData));
    } catch (error) {
      throw new Error(
        `Failed to find accounts by user ID: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create new account
   */
  async create(account: Account): Promise<Account> {
    try {
      const accountData = await this.prisma.account.create({
        data: {
          id: account.id,
          userId: account.userId,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          type: account.type,
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
          idToken: account.idToken,
          expiresAt: account.expiresAt,
          tokenType: account.tokenType,
          scope: account.scope,
          sessionState: account.sessionState,
        },
      });

      return this.mapToAccount(accountData);
    } catch (error) {
      throw new Error(
        `Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update existing account
   */
  async update(account: Account): Promise<Account> {
    try {
      const accountData = await this.prisma.account.update({
        where: { id: account.id },
        data: {
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
          idToken: account.idToken,
          expiresAt: account.expiresAt,
          tokenType: account.tokenType,
          scope: account.scope,
          sessionState: account.sessionState,
        },
      });

      return this.mapToAccount(accountData);
    } catch (error) {
      throw new Error(
        `Failed to update account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete account
   */
  async delete(accountId: string): Promise<void> {
    try {
      await this.prisma.account.delete({
        where: { id: accountId },
      });
    } catch (error) {
      throw new Error(
        `Failed to delete account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete all accounts for a user
   */
  async deleteByUserId(userId: string): Promise<void> {
    try {
      await this.prisma.account.deleteMany({
        where: { userId },
      });
    } catch (error) {
      throw new Error(
        `Failed to delete accounts by user ID: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Map Prisma account data to Account domain entity
   */
  private mapToAccount(accountData: any): Account {
    return new Account({
      id: accountData.id,
      userId: accountData.userId,
      provider: accountData.provider,
      providerAccountId: accountData.providerAccountId,
      type: accountData.type as 'oauth' | 'oidc',
      accessToken: accountData.accessToken,
      refreshToken: accountData.refreshToken,
      idToken: accountData.idToken,
      expiresAt: accountData.expiresAt,
      tokenType: accountData.tokenType,
      scope: accountData.scope,
      sessionState: accountData.sessionState,
    });
  }
}
