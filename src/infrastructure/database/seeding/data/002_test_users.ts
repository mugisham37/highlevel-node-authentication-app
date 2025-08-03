import { SeedData, SeedContext } from '../seed-manager';

const seed: SeedData = {
  id: '002_test_users',
  name: 'Create test users',
  description: 'Creates test users for development and testing environments',
  environment: 'development',
  version: '1.0.0',
  dependencies: ['001_default_roles_permissions'],

  async execute(context: SeedContext): Promise<void> {
    const { prisma, crypto } = context;

    // Get roles
    const adminRole = await prisma.role.findUnique({
      where: { name: 'admin' },
    });
    const moderatorRole = await prisma.role.findUnique({
      where: { name: 'moderator' },
    });
    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });

    if (!adminRole || !moderatorRole || !userRole) {
      throw new Error(
        'Required roles not found. Make sure 001_default_roles_permissions seed is applied.'
      );
    }

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'System Administrator',
        emailVerified: new Date(),
        passwordHash: await crypto.hashPassword('admin123!'),
        mfaEnabled: false,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    });

    // Create moderator user
    const moderatorUser = await prisma.user.create({
      data: {
        email: 'moderator@example.com',
        name: 'Content Moderator',
        emailVerified: new Date(),
        passwordHash: await crypto.hashPassword('moderator123!'),
        mfaEnabled: false,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: moderatorUser.id,
        roleId: moderatorRole.id,
      },
    });

    // Create regular users
    const regularUsers = [
      {
        email: 'user1@example.com',
        name: 'John Doe',
        password: 'user123!',
      },
      {
        email: 'user2@example.com',
        name: 'Jane Smith',
        password: 'user123!',
      },
      {
        email: 'user3@example.com',
        name: 'Bob Johnson',
        password: 'user123!',
      },
    ];

    for (const userData of regularUsers) {
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          emailVerified: new Date(),
          passwordHash: await crypto.hashPassword(userData.password),
          mfaEnabled: false,
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: userRole.id,
        },
      });
    }

    // Create a user with MFA enabled for testing
    const mfaUser = await prisma.user.create({
      data: {
        email: 'mfa@example.com',
        name: 'MFA Test User',
        emailVerified: new Date(),
        passwordHash: await crypto.hashPassword('mfa123!'),
        mfaEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP', // Test TOTP secret
        backupCodes: [
          await crypto.hashPassword('backup001'),
          await crypto.hashPassword('backup002'),
          await crypto.hashPassword('backup003'),
        ],
      },
    });

    await prisma.userRole.create({
      data: {
        userId: mfaUser.id,
        roleId: userRole.id,
      },
    });

    // Populate user auth cache for performance testing
    const users = await prisma.user.findMany();
    for (const user of users) {
      await context.drizzle.execute(
        `
        INSERT INTO user_auth_cache (
          user_id, email, password_hash, mfa_enabled, totp_secret,
          failed_login_attempts, risk_score, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          mfa_enabled = EXCLUDED.mfa_enabled,
          totp_secret = EXCLUDED.totp_secret,
          updated_at = NOW()
      `,
        [
          user.id,
          user.email,
          user.passwordHash,
          user.mfaEnabled,
          user.totpSecret,
          user.failedLoginAttempts,
          user.riskScore,
        ]
      );
    }

    console.log(`Created ${users.length} test users and populated auth cache`);
  },

  async rollback(context: SeedContext): Promise<void> {
    const { prisma, drizzle } = context;

    // Clear auth cache
    await drizzle.execute(`DELETE FROM user_auth_cache`);

    // Delete user roles and users
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin@example.com',
            'moderator@example.com',
            'user1@example.com',
            'user2@example.com',
            'user3@example.com',
            'mfa@example.com',
          ],
        },
      },
    });

    console.log('Rolled back test users');
  },
};

export default seed;
