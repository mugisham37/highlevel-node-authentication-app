import { SeedData, SeedContext } from '../seed-manager';

const seed: SeedData = {
  id: '001_default_roles_permissions',
  name: 'Create default roles and permissions',
  description:
    'Creates basic roles (admin, user, moderator) and their associated permissions',
  environment: 'development',
  version: '1.0.0',

  async execute(context: SeedContext): Promise<void> {
    const { prisma } = context;

    // Create permissions
    const permissions = await Promise.all([
      // User management permissions
      prisma.permission.create({
        data: {
          name: 'user:read',
          resource: 'user',
          action: 'read',
        },
      }),
      prisma.permission.create({
        data: {
          name: 'user:write',
          resource: 'user',
          action: 'write',
        },
      }),
      prisma.permission.create({
        data: {
          name: 'user:delete',
          resource: 'user',
          action: 'delete',
        },
      }),

      // Role management permissions
      prisma.permission.create({
        data: {
          name: 'role:read',
          resource: 'role',
          action: 'read',
        },
      }),
      prisma.permission.create({
        data: {
          name: 'role:write',
          resource: 'role',
          action: 'write',
        },
      }),
      prisma.permission.create({
        data: {
          name: 'role:assign',
          resource: 'role',
          action: 'assign',
        },
      }),

      // System administration permissions
      prisma.permission.create({
        data: {
          name: 'system:admin',
          resource: 'system',
          action: 'admin',
        },
      }),
      prisma.permission.create({
        data: {
          name: 'audit:read',
          resource: 'audit',
          action: 'read',
        },
      }),

      // Webhook permissions
      prisma.permission.create({
        data: {
          name: 'webhook:read',
          resource: 'webhook',
          action: 'read',
        },
      }),
      prisma.permission.create({
        data: {
          name: 'webhook:write',
          resource: 'webhook',
          action: 'write',
        },
      }),
    ]);

    // Create roles
    const adminRole = await prisma.role.create({
      data: {
        name: 'admin',
        description: 'Full system administrator with all permissions',
      },
    });

    const moderatorRole = await prisma.role.create({
      data: {
        name: 'moderator',
        description: 'Moderator with user management permissions',
      },
    });

    const userRole = await prisma.role.create({
      data: {
        name: 'user',
        description: 'Basic user with read permissions',
      },
    });

    // Assign permissions to admin role (all permissions)
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      });
    }

    // Assign permissions to moderator role
    const moderatorPermissions = permissions.filter(
      (p) => p.name.includes('user:') || p.name.includes('audit:read')
    );
    for (const permission of moderatorPermissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: moderatorRole.id,
          permissionId: permission.id,
        },
      });
    }

    // Assign permissions to user role
    const userPermissions = permissions.filter(
      (p) => p.name === 'user:read' || p.name === 'webhook:read'
    );
    for (const permission of userPermissions) {
      await prisma.rolePermission.create({
        data: {
          roleId: userRole.id,
          permissionId: permission.id,
        },
      });
    }

    console.log(`Created ${permissions.length} permissions and 3 roles`);
  },

  async rollback(context: SeedContext): Promise<void> {
    const { prisma } = context;

    // Delete in reverse order due to foreign key constraints
    await prisma.rolePermission.deleteMany();
    await prisma.role.deleteMany({
      where: {
        name: {
          in: ['admin', 'moderator', 'user'],
        },
      },
    });
    await prisma.permission.deleteMany();

    console.log('Rolled back default roles and permissions');
  },
};

export default seed;
