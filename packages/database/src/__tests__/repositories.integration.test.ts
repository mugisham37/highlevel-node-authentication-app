import { User } from '@company/shared/entities/user';
import { Email } from '@company/shared/value-objects/email';
import { Password } from '@company/shared/value-objects/password';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseClientFactory } from '../client';
import { DrizzleSessionRepository } from '../repositories/drizzle-session-repository';
import { PrismaUserRepository } from '../repositories/prisma-user-repository';

describe('Repository Integration Tests', () => {
  let prismaClient: any;
  let drizzleClient: any;
  let userRepository: PrismaUserRepository;
  let sessionRepository: DrizzleSessionRepository;

  beforeAll(async () => {
    prismaClient = DatabaseClientFactory.createPrismaClient();
    drizzleClient = DatabaseClientFactory.createDrizzleClient();
    userRepository = new PrismaUserRepository(prismaClient);
    sessionRepository = new DrizzleSessionRepository(drizzleClient);
  });

  afterAll(async () => {
    await DatabaseClientFactory.closeConnections();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      await prismaClient.session.deleteMany();
      await prismaClient.user.deleteMany();
    } catch (error) {
      // Ignore cleanup errors in test environment
    }
  });

  describe('PrismaUserRepository', () => {
    it('should create and retrieve a user', async () => {
      const userData = {
        email: new Email('test@example.com'),
        password: new Password('SecurePass123!'),
        firstName: 'Test',
        lastName: 'User',
      };

      const createdUser = await userRepository.create(userData);
      expect(createdUser).toBeDefined();
      expect(createdUser.email.value).toBe('test@example.com');

      const retrievedUser = await userRepository.findByEmail(userData.email);
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.id).toBe(createdUser.id);
    });

    it('should update user information', async () => {
      const userData = {
        email: new Email('update@example.com'),
        password: new Password('SecurePass123!'),
        firstName: 'Update',
        lastName: 'Test',
      };

      const user = await userRepository.create(userData);
      const updatedUser = await userRepository.update(user.id, {
        firstName: 'Updated',
      });

      expect(updatedUser.firstName).toBe('Updated');
      expect(updatedUser.lastName).toBe('Test'); // Should remain unchanged
    });

    it('should delete a user', async () => {
      const userData = {
        email: new Email('delete@example.com'),
        password: new Password('SecurePass123!'),
        firstName: 'Delete',
        lastName: 'Test',
      };

      const user = await userRepository.create(userData);
      await userRepository.delete(user.id);

      const deletedUser = await userRepository.findById(user.id);
      expect(deletedUser).toBeNull();
    });
  });

  describe('DrizzleSessionRepository', () => {
    let testUser: User;

    beforeEach(async () => {
      const userData = {
        email: new Email('session@example.com'),
        password: new Password('SecurePass123!'),
        firstName: 'Session',
        lastName: 'Test',
      };
      testUser = await userRepository.create(userData);
    });

    it('should create and retrieve a session', async () => {
      const sessionData = {
        userId: testUser.id,
        deviceInfo: {
          userAgent: 'Test Browser',
          ipAddress: '127.0.0.1',
          deviceFingerprint: 'test-fingerprint',
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      const createdSession = await sessionRepository.create(sessionData);
      expect(createdSession).toBeDefined();
      expect(createdSession.userId).toBe(testUser.id);

      const retrievedSession = await sessionRepository.findById(createdSession.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.userId).toBe(testUser.id);
    });

    it('should find sessions by user ID', async () => {
      const sessionData = {
        userId: testUser.id,
        deviceInfo: {
          userAgent: 'Test Browser',
          ipAddress: '127.0.0.1',
          deviceFingerprint: 'test-fingerprint',
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      await sessionRepository.create(sessionData);
      await sessionRepository.create({
        ...sessionData,
        deviceInfo: { ...sessionData.deviceInfo, userAgent: 'Another Browser' },
      });

      const userSessions = await sessionRepository.findByUserId(testUser.id);
      expect(userSessions).toHaveLength(2);
      expect(userSessions.every(session => session.userId === testUser.id)).toBe(true);
    });

    it('should update session information', async () => {
      const sessionData = {
        userId: testUser.id,
        deviceInfo: {
          userAgent: 'Test Browser',
          ipAddress: '127.0.0.1',
          deviceFingerprint: 'test-fingerprint',
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const session = await sessionRepository.create(sessionData);
      const newExpiryDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      const updatedSession = await sessionRepository.update(session.id, {
        expiresAt: newExpiryDate,
      });

      expect(updatedSession.expiresAt.getTime()).toBe(newExpiryDate.getTime());
    });

    it('should delete a session', async () => {
      const sessionData = {
        userId: testUser.id,
        deviceInfo: {
          userAgent: 'Test Browser',
          ipAddress: '127.0.0.1',
          deviceFingerprint: 'test-fingerprint',
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const session = await sessionRepository.create(sessionData);
      await sessionRepository.delete(session.id);

      const deletedSession = await sessionRepository.findById(session.id);
      expect(deletedSession).toBeNull();
    });
  });

  describe('Cross-ORM Operations', () => {
    it('should work with both Prisma and Drizzle repositories together', async () => {
      // Create user with Prisma
      const userData = {
        email: new Email('crossorm@example.com'),
        password: new Password('SecurePass123!'),
        firstName: 'Cross',
        lastName: 'ORM',
      };

      const user = await userRepository.create(userData);

      // Create session with Drizzle
      const sessionData = {
        userId: user.id,
        deviceInfo: {
          userAgent: 'Cross ORM Browser',
          ipAddress: '127.0.0.1',
          deviceFingerprint: 'cross-orm-fingerprint',
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const session = await sessionRepository.create(sessionData);

      // Verify both operations worked
      expect(user.id).toBeDefined();
      expect(session.userId).toBe(user.id);

      // Clean up
      await sessionRepository.delete(session.id);
      await userRepository.delete(user.id);
    });
  });
});