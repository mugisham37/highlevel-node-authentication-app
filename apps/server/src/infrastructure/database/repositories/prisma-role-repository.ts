/**
 * Prisma Role Repository Implementation
 * Handles role data access operations using Prisma ORM
 */

import { PrismaClient, Prisma } from '../../../generated/prisma';
import { Logger } from 'winston';
import { Role } from '../../../domain/entities/role';
import { Permission } from '../../../domain/entities/permission';
import {
  IRoleRepository,
  CreateRoleData,
  UpdateRoleData,
  RoleFilters,
  RoleWithPermissions,
} from '../../../application/interfaces/role-repository.interface';
import { 
  safeJsonParse, 
} from '../type-utils';

export class PrismaRoleRepository implements IRoleRepository {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  private mapToPermission(permissionData: any): Permission {
    const parsedConditions = safeJsonParse(permissionData.conditions);

    return new Permission({
      id: permissionData.id,
      name: permissionData.name,
      resource: permissionData.resource,
      action: permissionData.action,
      ...(parsedConditions && { conditions: parsedConditions }),
      createdAt: permissionData.createdAt,
    });
  }

  private mapToRole(roleData: any, permissions: Permission[] = []): Role {
    return new Role({
      id: roleData.id,
      name: roleData.name,
      ...(roleData.description !== null && { description: roleData.description }),
      createdAt: roleData.createdAt,
      updatedAt: roleData.updatedAt,
      permissions,
    });
  }

  private createSafeIncludeConfig(includePermissions: boolean) {
    return includePermissions
      ? {
          permissions: {
            include: {
              permission: true,
            },
          },
        }
      : null;
  }

  async create(data: CreateRoleData): Promise<Role> {
    try {
      const roleData = await this.prisma.role.create({
        data: {
          name: data.name,
          description: data.description || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const role = this.mapToRole(roleData);

      this.logger.info('Role created successfully', {
        roleId: role.id,
        name: role.name,
      });

      return role;
    } catch (error) {
      this.logger.error('Failed to create role', { error, data });
      throw error;
    }
  }

  async findById(
    id: string,
    includePermissions = false
  ): Promise<RoleWithPermissions | null> {
    try {
      const includeConfig = this.createSafeIncludeConfig(includePermissions);
      
      const roleData = await this.prisma.role.findUnique({
        where: { id },
        include: includeConfig,
      });

      if (!roleData) return null;

      const permissions =
        includePermissions && (roleData as any).permissions
          ? (roleData as any).permissions.map(
              (rp: any) => this.mapToPermission(rp.permission)
            )
          : [];

      const role = this.mapToRole(roleData, permissions);

      return {
        ...role,
        permissions,
      } as RoleWithPermissions;
    } catch (error) {
      this.logger.error('Failed to find role by ID', { error, id });
      throw error;
    }
  }

  async findByName(
    name: string,
    includePermissions = false
  ): Promise<RoleWithPermissions | null> {
    try {
      const includeConfig = this.createSafeIncludeConfig(includePermissions);
      
      const roleData = await this.prisma.role.findUnique({
        where: { name },
        include: includeConfig,
      });

      if (!roleData) return null;

      const permissions =
        includePermissions && (roleData as any).permissions
          ? (roleData as any).permissions.map(
              (rp: any) => this.mapToPermission(rp.permission)
            )
          : [];

      const role = this.mapToRole(roleData, permissions);

      return {
        ...role,
        permissions,
      } as RoleWithPermissions;
    } catch (error) {
      this.logger.error('Failed to find role by name', { error, name });
      throw error;
    }
  }

  async update(id: string, data: UpdateRoleData): Promise<Role> {
    try {
      const updateData: Prisma.RoleUpdateInput = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined)
        updateData.description = data.description || null;

      const roleData = await this.prisma.role.update({
        where: { id },
        data: updateData,
      });

      const role = this.mapToRole(roleData);

      this.logger.info('Role updated successfully', { roleId: id });
      return role;
    } catch (error) {
      this.logger.error('Failed to update role', { error, id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.role.delete({
        where: { id },
      });

      this.logger.info('Role deleted successfully', { roleId: id });
    } catch (error) {
      this.logger.error('Failed to delete role', { error, id });
      throw error;
    }
  }

  async findMany(
    filters: RoleFilters
  ): Promise<{ roles: RoleWithPermissions[]; total: number }> {
    try {
      const where: any = {};

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      if (filters.createdAfter) {
        where.createdAt = { ...where.createdAt, gte: filters.createdAfter };
      }

      if (filters.createdBefore) {
        where.createdAt = { ...where.createdAt, lte: filters.createdBefore };
      }

      if (filters.hasPermission) {
        where.permissions = {
          some: {
            permission: {
              name: filters.hasPermission,
            },
          },
        };
      }

      const orderBy: any = {};
      if (filters.sortBy) {
        orderBy[filters.sortBy] = filters.sortOrder || 'asc';
      } else {
        orderBy.createdAt = 'desc';
      }

      const [rolesData, total] = await Promise.all([
        this.prisma.role.findMany({
          where,
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
          take: filters.limit || 50,
          skip: filters.offset || 0,
          orderBy,
        }),
        this.prisma.role.count({ where }),
      ]);

      const roles = rolesData.map((roleData: any) => {
        const permissions = roleData.permissions.map(
          (rp: any) => this.mapToPermission(rp.permission)
        );

        const role = this.mapToRole(roleData, permissions);

        return {
          ...role,
          permissions,
        } as RoleWithPermissions;
      });

      return { roles, total };
    } catch (error) {
      this.logger.error('Failed to find roles with filters', {
        error,
        filters,
      });
      throw error;
    }
  }

  async findByIds(
    ids: string[],
    includePermissions = false
  ): Promise<RoleWithPermissions[]> {
    try {
      const rolesData = await this.prisma.role.findMany({
        where: { id: { in: ids } },
        include: includePermissions
          ? {
              permissions: {
                include: {
                  permission: true,
                },
              },
            }
          : null,
      });

      return rolesData.map((roleData: any) => {
        const permissions =
          includePermissions && roleData.permissions
            ? roleData.permissions.map(
                (rp: any) =>
                  new Permission({
                    id: rp.permission.id,
                    name: rp.permission.name,
                    resource: rp.permission.resource,
                    action: rp.permission.action,
                    conditions: rp.permission.conditions || undefined,
                    createdAt: rp.permission.createdAt,
                  })
              )
            : [];

        const role = new Role({
          id: roleData.id,
          name: roleData.name,
          description: roleData.description || undefined,
          createdAt: roleData.createdAt,
          updatedAt: roleData.updatedAt,
          permissions,
        });

        return {
          ...role,
          permissions,
        } as RoleWithPermissions;
      });
    } catch (error) {
      this.logger.error('Failed to find roles by IDs', { error, ids });
      throw error;
    }
  }

  async search(query: string, limit = 10): Promise<RoleWithPermissions[]> {
    try {
      const rolesData = await this.prisma.role.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
        take: limit,
        orderBy: { name: 'asc' },
      });

      return rolesData.map((roleData: any) => {
        const permissions = roleData.permissions.map(
          (rp: any) =>
            new Permission({
              id: rp.permission.id,
              name: rp.permission.name,
              resource: rp.permission.resource,
              action: rp.permission.action,
              conditions: rp.permission.conditions || undefined,
              createdAt: rp.permission.createdAt,
            })
        );

        const role = new Role({
          id: roleData.id,
          name: roleData.name,
          description: roleData.description || undefined,
          createdAt: roleData.createdAt,
          updatedAt: roleData.updatedAt,
          permissions,
        });

        return {
          ...role,
          permissions,
        } as RoleWithPermissions;
      });
    } catch (error) {
      this.logger.error('Failed to search roles', { error, query });
      throw error;
    }
  }

  async addPermission(roleId: string, permissionId: string): Promise<void> {
    try {
      await this.prisma.rolePermission.create({
        data: {
          roleId,
          permissionId,
        },
      });

      this.logger.info('Permission added to role', { roleId, permissionId });
    } catch (error) {
      this.logger.error('Failed to add permission to role', {
        error,
        roleId,
        permissionId,
      });
      throw error;
    }
  }

  async removePermission(roleId: string, permissionId: string): Promise<void> {
    try {
      await this.prisma.rolePermission.deleteMany({
        where: {
          roleId,
          permissionId,
        },
      });

      this.logger.info('Permission removed from role', {
        roleId,
        permissionId,
      });
    } catch (error) {
      this.logger.error('Failed to remove permission from role', {
        error,
        roleId,
        permissionId,
      });
      throw error;
    }
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    try {
      const rolePermissions = await this.prisma.rolePermission.findMany({
        where: { roleId },
        include: {
          permission: true,
        },
      });

      return rolePermissions.map(
        (rp: any) =>
          new Permission({
            id: rp.permission.id,
            name: rp.permission.name,
            resource: rp.permission.resource,
            action: rp.permission.action,
            conditions: rp.permission.conditions || undefined,
            createdAt: rp.permission.createdAt,
          })
      );
    } catch (error) {
      this.logger.error('Failed to get role permissions', { error, roleId });
      throw error;
    }
  }

  async hasPermission(roleId: string, permissionId: string): Promise<boolean> {
    try {
      const rolePermission = await this.prisma.rolePermission.findFirst({
        where: {
          roleId,
          permissionId,
        },
      });

      return rolePermission !== null;
    } catch (error) {
      this.logger.error('Failed to check role permission', {
        error,
        roleId,
        permissionId,
      });
      throw error;
    }
  }

  async findSystemRoles(): Promise<RoleWithPermissions[]> {
    try {
      const systemRoleNames = ['admin', 'user', 'guest', 'moderator'];

      const rolesData = await this.prisma.role.findMany({
        where: {
          name: { in: systemRoleNames },
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      return rolesData.map((roleData: any) => {
        const permissions = roleData.permissions.map(
          (rp: any) =>
            new Permission({
              id: rp.permission.id,
              name: rp.permission.name,
              resource: rp.permission.resource,
              action: rp.permission.action,
              conditions: rp.permission.conditions || undefined,
              createdAt: rp.permission.createdAt,
            })
        );

        const role = new Role({
          id: roleData.id,
          name: roleData.name,
          description: roleData.description || undefined,
          createdAt: roleData.createdAt,
          updatedAt: roleData.updatedAt,
          permissions,
        });

        return {
          ...role,
          permissions,
        } as RoleWithPermissions;
      });
    } catch (error) {
      this.logger.error('Failed to find system roles', { error });
      throw error;
    }
  }

  async isSystemRole(roleId: string): Promise<boolean> {
    try {
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { name: true },
      });

      if (!role) return false;

      const systemRoleNames = ['admin', 'user', 'guest', 'moderator'];
      return systemRoleNames.includes(role.name.toLowerCase());
    } catch (error) {
      this.logger.error('Failed to check if role is system role', {
        error,
        roleId,
      });
      throw error;
    }
  }

  async getUserCount(roleId: string): Promise<number> {
    try {
      return await this.prisma.userRole.count({
        where: { roleId },
      });
    } catch (error) {
      this.logger.error('Failed to get user count for role', { error, roleId });
      throw error;
    }
  }

  async findUsersWithRole(
    roleId: string,
    limit = 50,
    offset = 0
  ): Promise<{
    users: Array<{
      id: string;
      email: string;
      name?: string;
      assignedAt: Date;
    }>;
    total: number;
  }> {
    try {
      const [userRoles, total] = await Promise.all([
        this.prisma.userRole.findMany({
          where: { roleId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          take: limit,
          skip: offset,
          orderBy: { assignedAt: 'desc' },
        }),
        this.prisma.userRole.count({ where: { roleId } }),
      ]);

      const users = userRoles.map((ur: any) => ({
        id: ur.user.id,
        email: ur.user.email,
        name: ur.user.name || undefined,
        assignedAt: ur.assignedAt,
      }));

      return { users, total };
    } catch (error) {
      this.logger.error('Failed to find users with role', { error, roleId });
      throw error;
    }
  }

  async getRoleHierarchy(): Promise<
    Array<{
      role: Role;
      level: number;
      userCount: number;
      permissionCount: number;
    }>
  > {
    try {
      const rolesData = await this.prisma.role.findMany({
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
          users: true,
        },
      });

      return rolesData
        .map((roleData: any) => {
          const permissions = roleData.permissions.map(
            (rp: any) =>
              new Permission({
                id: rp.permission.id,
                name: rp.permission.name,
                resource: rp.permission.resource,
                action: rp.permission.action,
                conditions: rp.permission.conditions || undefined,
                createdAt: rp.permission.createdAt,
              })
          );

          const role = new Role({
            id: roleData.id,
            name: roleData.name,
            description: roleData.description || undefined,
            createdAt: roleData.createdAt,
            updatedAt: roleData.updatedAt,
            permissions,
          });

          return {
            role,
            level: role.getHierarchyLevel(),
            userCount: roleData.users.length,
            permissionCount: permissions.length,
          };
        })
        .sort((a, b) => b.level - a.level);
    } catch (error) {
      this.logger.error('Failed to get role hierarchy', { error });
      throw error;
    }
  }

  async bulkCreate(roles: CreateRoleData[]): Promise<Role[]> {
    try {
      const result = await this.prisma.$transaction(
        roles.map((roleData) =>
          this.prisma.role.create({
            data: {
              name: roleData.name,
              description: roleData.description || null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })
        )
      );

      const createdRoles = result.map(
        (roleData: any) =>
          new Role({
            id: roleData.id,
            name: roleData.name,
            description: roleData.description || undefined,
            createdAt: roleData.createdAt,
            updatedAt: roleData.updatedAt,
            permissions: [],
          })
      );

      this.logger.info('Bulk role creation completed', {
        count: createdRoles.length,
      });
      return createdRoles;
    } catch (error) {
      this.logger.error('Failed to bulk create roles', {
        error,
        count: roles.length,
      });
      throw error;
    }
  }

  async bulkDelete(roleIds: string[]): Promise<void> {
    try {
      await this.prisma.role.deleteMany({
        where: { id: { in: roleIds } },
      });

      this.logger.info('Bulk role deletion completed', {
        count: roleIds.length,
      });
    } catch (error) {
      this.logger.error('Failed to bulk delete roles', { error, roleIds });
      throw error;
    }
  }

  async getStats(): Promise<{
    total: number;
    systemRoles: number;
    adminRoles: number;
    averagePermissions: number;
    mostUsedRoles: Array<{ roleId: string; name: string; userCount: number }>;
  }> {
    try {
      const [total, systemRoles, adminRoles, rolesWithCounts] = await Promise.all([
        this.prisma.role.count(),
        this.prisma.role.count({
          where: {
            name: { in: ['admin', 'user', 'guest', 'moderator'] },
          },
        }),
        this.prisma.role.count({
          where: {
            name: { contains: 'admin', mode: 'insensitive' },
          },
        }),
        this.prisma.role.findMany({
          include: {
            permissions: true,
            users: true,
          },
        }),
      ]);

      const totalPermissions = rolesWithCounts.reduce(
        (sum, role) => sum + role.permissions.length,
        0
      );
      const averagePermissions = total > 0 ? totalPermissions / total : 0;

      const mostUsedRoles = rolesWithCounts
        .map((role) => ({
          roleId: role.id,
          name: role.name,
          userCount: role.users.length,
        }))
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 5);

      return {
        total,
        systemRoles,
        adminRoles,
        averagePermissions: Math.round(averagePermissions * 100) / 100,
        mostUsedRoles,
      };
    } catch (error) {
      this.logger.error('Failed to get role stats', { error });
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const role = await this.prisma.role.findUnique({
        where: { id },
        select: { id: true },
      });
      return role !== null;
    } catch (error) {
      this.logger.error('Failed to check role existence', { error, id });
      throw error;
    }
  }

  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    try {
      const where: any = { name };
      if (excludeId) {
        where.id = { not: excludeId };
      }

      const role = await this.prisma.role.findFirst({
        where,
        select: { id: true },
      });
      return role !== null;
    } catch (error) {
      this.logger.error('Failed to check role name existence', {
        error,
        name,
        excludeId,
      });
      throw error;
    }
  }
}
