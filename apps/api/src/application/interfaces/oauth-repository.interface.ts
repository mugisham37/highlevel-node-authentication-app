/**
 * OAuth Repository Interfaces
 * Defines contracts for OAuth data persistence
 */

import { User } from "@company/shared"entities/user';
import { Account } from "@company/shared"entities/account';

export interface IOAuthUserRepository {
  /**
   * Find user by email address
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find user by OAuth provider account
   */
  findByProviderAccount(
    provider: string,
    providerAccountId: string
  ): Promise<User | null>;

  /**
   * Create new user
   */
  create(user: User): Promise<User>;

  /**
   * Update existing user
   */
  update(user: User): Promise<User>;

  /**
   * Delete user
   */
  delete(userId: string): Promise<void>;
}

export interface IOAuthAccountRepository {
  /**
   * Find account by user ID and provider
   */
  findByUserAndProvider(
    userId: string,
    provider: string
  ): Promise<Account | null>;

  /**
   * Find account by provider and provider account ID
   */
  findByProviderAccount(
    provider: string,
    providerAccountId: string
  ): Promise<Account | null>;

  /**
   * Find all accounts for a user
   */
  findByUserId(userId: string): Promise<Account[]>;

  /**
   * Create new account
   */
  create(account: Account): Promise<Account>;

  /**
   * Update existing account
   */
  update(account: Account): Promise<Account>;

  /**
   * Delete account
   */
  delete(accountId: string): Promise<void>;

  /**
   * Delete all accounts for a user
   */
  deleteByUserId(userId: string): Promise<void>;
}

export interface IOAuthStateRepository {
  /**
   * Store OAuth state information
   */
  storeState(
    state: string,
    data: {
      provider: string;
      codeVerifier?: string | undefined;
      nonce?: string | undefined;
      redirectUri?: string | undefined;
      scopes?: string[] | undefined;
    },
    expiresIn: number
  ): Promise<void>;

  /**
   * Retrieve and delete OAuth state information
   */
  consumeState(state: string): Promise<{
    provider: string;
    codeVerifier?: string | undefined;
    nonce?: string | undefined;
    redirectUri?: string | undefined;
    scopes?: string[] | undefined;
  } | null>;

  /**
   * Clean up expired states
   */
  cleanupExpiredStates(): Promise<number>;
}

export interface IOAuthAuthorizationCodeRepository {
  /**
   * Store authorization code
   */
  storeCode(
    code: string,
    data: {
      clientId: string;
      userId: string;
      scopes: string[];
      redirectUri: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
    },
    expiresIn: number
  ): Promise<void>;

  /**
   * Retrieve and mark authorization code as used
   */
  consumeCode(code: string): Promise<{
    clientId: string;
    userId: string;
    scopes: string[];
    redirectUri: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  } | null>;

  /**
   * Check if authorization code exists and is valid
   */
  isCodeValid(code: string): Promise<boolean>;

  /**
   * Clean up expired authorization codes
   */
  cleanupExpiredCodes(): Promise<number>;
}

