/**
 * Prisma Permission Repository Implementation
 * Handles permission data access operations using Prisma ORM
 */

import { PrismaClient } from '../../../generated/prisma';
import { Logger } from 'winston';
import { Permission } from '../../../domain/entities/permission';
import {
  IPermissionRepository,
  CreatePermissionData,
  UpdatePermissionData,
  PermissionFilters,
} from '../../../application/interfaces/permission-repository.interface';
import { jsonValueToRecord, JsonValue } from '../../../types/prisma-json.types';

export class PrismaPermissionRepository implements IPermissionRepository {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) {}

  private mapToPermission(permissionData: any): Permission {
    const parsedConditions = this.parseConditions(permissionData.conditions);

    return new Permission({
      id: permissionData.id,
      name: permissionData.name,
      resource: permissionData.resource,
      action: permissionData.action,
      conditions: parsedConditions,
      createdAt: permissionData.createdAt,
    });
  }

  private parseConditions(
    conditions: JsonValue | null | undefined
  ): Record<string, any> | undefined {
    return jsonValueToRecord(conditions);
  }

  async create(data: CreatePermissionData): Promise<Permission> {
    try {
      const createData = {
        name: data.name,
        resource: data.resource,
        action: data.action,
        conditions: data.conditions || null,
        createdAt: new Date(),
      };

      const permissionData = await this.prisma.permission.create({
        data: createData,
      });

      const permission = this.mapToPermission(permissionData);

      this.logger.info('Permission created successfully', {
        permissionId: permission.id,
        name: permission.name,
        resource: permission.resource,
        action: permission.action,
      });

      return permission;
    } catch (error) {
      this.logger.error('Failed to create permission', { error, data });
      throw error;
    }
  }

  async findById(id: string): Promise<Permission | null> {
    try {
      const permissionData = await this.prisma.permission.findUnique({
        where: { id },
      });

      if (!permissionData) return null;

      return this.mapToPermission(permissionData);
    } catch (error) {
      this.logger.error('Failed to find permission by ID', { error, id });
      throw error;
    }
  }

  async findByName(name: string): Promise<Permission | null> {
    try {
      const permissionData = await this.prisma.permission.findUnique({
        where: { name },
      });

      if (!permissionData) return null;

      return this.mapToPermission(permissionData);
    } catch (error) {
      this.logger.error('Failed to find permission by name', { error, name });
      throw error;
    }
  }

  async update(id: string, data: UpdatePermissionData): Promise<Permission> {
    try {
      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.resource !== undefined) updateData.resource = data.resource;
      if (data.action !== undefined) updateData.action = data.action;
      if (data.conditions !== undefined)
        updateData.conditions = data.conditions || null;

      const permissionData = await this.prisma.permission.update({
        where: { id },
        data: updateData,
      });

      const permission = this.mapToPermission(permissionData);

      this.logger.info('Permission updated successfully', { permissionId: id });
      return permission;
    } catch (error) {
      this.logger.error('Failed to update permission', { error, id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.permission.delete({
        where: { id },
      });

      this.logger.info('Permission deleted successfully', { permissionId: id });
    } catch (error) {
      this.logger.error('Failed to delete permission', { error, id });
      throw error;
    }
  }

  async findMany(
    filters: PermissionFilters
  ): Promise<{ permissions: Permission[]; total: number }> {
    try {
      const where: any = {};

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { resource: { contains: filters.search, mode: 'insensitive' } },
          { action: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      if (filters.resource) {
        where.resource = filters.resource;
      }

      if (filters.action) {
        where.action = filters.action;
      }

      if (filters.createdAfter) {
        where.createdAt = { ...where.createdAt, gte: filters.createdAfter };
      }

      if (filters.createdBefore) {
        where.createdAt = { ...where.createdAt, lte: filters.createdBefore };
      }

      const orderBy: any = {};
      if (filters.sortBy) {
        orderBy[filters.sortBy] = filters.sortOrder || 'asc';
      } else {
        orderBy.createdAt = 'desc';
      }

      const [permissionsData, total] = await Promise.all([
        this.prisma.permission.findMany({
          where,
          take: filters.limit || 50,
          skip: filters.offset || 0,
          orderBy,
        }),
        this.prisma.permission.count({ where }),
      ]);

      const permissions = permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );

      // Apply additional filters that require domain logic
      let filteredPermissions = permissions;

      if (filters.isWildcard !== undefined) {
        filteredPermissions = filteredPermissions.filter(
          (p) => p.isWildcard() === filters.isWildcard
        );
      }

      if (filters.isAdministrative !== undefined) {
        filteredPermissions = filteredPermissions.filter(
          (p) => p.isAdministrative() === filters.isAdministrative
        );
      }

      if (filters.scopeLevelMin !== undefined) {
        filteredPermissions = filteredPermissions.filter(
          (p) => p.getScopeLevel() >= filters.scopeLevelMin!
        );
      }

      if (filters.scopeLevelMax !== undefined) {
        filteredPermissions = filteredPermissions.filter(
          (p) => p.getScopeLevel() <= filters.scopeLevelMax!
        );
      }

      return { permissions: filteredPermissions, total };
    } catch (error) {
      this.logger.error('Failed to find permissions with filters', {
        error,
        filters,
      });
      throw error;
    }
  }

  async findByIds(ids: string[]): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: { id: { in: ids } },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find permissions by IDs', { error, ids });
      throw error;
    }
  }

  async search(query: string, limit = 10): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { resource: { contains: query, mode: 'insensitive' } },
            { action: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { name: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to search permissions', { error, query });
      throw error;
    }
  }

  async findByResource(resource: string): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: { resource },
        orderBy: { action: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find permissions by resource', {
        error,
        resource,
      });
      throw error;
    }
  }

  async findByAction(action: string): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: { action },
        orderBy: { resource: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find permissions by action', {
        error,
        action,
      });
      throw error;
    }
  }

  async findByResourceAndAction(
    resource: string,
    action: string
  ): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: { resource, action },
        orderBy: { name: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find permissions by resource and action', {
        error,
        resource,
        action,
      });
      throw error;
    }
  }

  async getResources(): Promise<string[]> {
    try {
      const result = await this.prisma.permission.findMany({
        select: { resource: true },
        distinct: ['resource'],
        orderBy: { resource: 'asc' },
      });

      return result.map((r) => r.resource);
    } catch (error) {
      this.logger.error('Failed to get resources', { error });
      throw error;
    }
  }

  async getActions(): Promise<string[]> {
    try {
      const result = await this.prisma.permission.findMany({
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      });

      return result.map((a) => a.action);
    } catch (error) {
      this.logger.error('Failed to get actions', { error });
      throw error;
    }
  }

  async getResourceActions(resource: string): Promise<string[]> {
    try {
      const result = await this.prisma.permission.findMany({
        where: { resource },
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      });

      return result.map((a) => a.action);
    } catch (error) {
      this.logger.error('Failed to get resource actions', { error, resource });
      throw error;
    }
  }

  async findSystemPermissions(): Promise<Permission[]> {
    try {
      // System permissions are those with wildcard resources/actions or admin prefixes
      const permissionsData = await this.prisma.permission.findMany({
        where: {
          OR: [
            { resource: '*' },
            { action: '*' },
            { name: { startsWith: 'admin:' } },
            { resource: { contains: 'admin' } },
          ],
        },
        orderBy: { name: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find system permissions', { error });
      throw error;
    }
  }

  async isSystemPermission(permissionId: string): Promise<boolean> {
    try {
      const permission = await this.findById(permissionId);
      return permission ? permission.isAdministrative() : false;
    } catch (error) {
      this.logger.error('Failed to check if permission is system permission', {
        error,
        permissionId,
      });
      throw error;
    }
  }

  async getRoleCount(permissionId: string): Promise<number> {
    try {
      return await this.prisma.rolePermission.count({
        where: { permissionId },
      });
    } catch (error) {
      this.logger.error('Failed to get role count for permission', {
        error,
        permissionId,
      });
      throw error;
    }
  }

  async findRolesWithPermission(
    permissionId: string,
    limit = 50,
    offset = 0
  ): Promise<{
    roles: Array<{ id: string; name: string; description?: string }>;
    total: number;
  }> {
    try {
      const [rolePermissions, total] = await Promise.all([
        this.prisma.rolePermission.findMany({
          where: { permissionId },
          include: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
          take: limit,
          skip: offset,
        }),
        this.prisma.rolePermission.count({ where: { permissionId } }),
      ]);

      const roles = rolePermissions.map((rp: any) => ({
        id: rp.role.id,
        name: rp.role.name,
        description: rp.role.description || undefined,
      }));

      return { roles, total };
    } catch (error) {
      this.logger.error('Failed to find roles with permission', {
        error,
        permissionId,
      });
      throw error;
    }
  }

  async findWildcardPermissions(): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: {
          OR: [
            { resource: '*' },
            { action: '*' },
            { resource: { endsWith: '*' } },
            { action: { endsWith: '*' } },
          ],
        },
        orderBy: { name: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find wildcard permissions', { error });
      throw error;
    }
  }

  async findAdministrativePermissions(): Promise<Permission[]> {
    try {
      const permissionsData = await this.prisma.permission.findMany({
        where: {
          OR: [
            { name: { startsWith: 'admin:' } },
            { resource: { contains: 'admin' } },
            { action: { contains: 'admin' } },
            { resource: '*' },
            { action: '*' },
          ],
        },
        orderBy: { name: 'asc' },
      });

      return permissionsData.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );
    } catch (error) {
      this.logger.error('Failed to find administrative permissions', { error });
      throw error;
    }
  }

  async bulkCreate(permissions: CreatePermissionData[]): Promise<Permission[]> {
    try {
      const result = await this.prisma.$transaction(
        permissions.map((permissionData) =>
          this.prisma.permission.create({
            data: {
              name: permissionData.name,
              resource: permissionData.resource,
              action: permissionData.action,
              conditions: permissionData.conditions || null,
              createdAt: new Date(),
            },
          })
        )
      );

      const createdPermissions = result.map((permissionData: any) =>
        this.mapToPermission(permissionData)
      );

      this.logger.info('Bulk permission creation completed', {
        count: createdPermissions.length,
      });
      return createdPermissions;
    } catch (error) {
      this.logger.error('Failed to bulk create permissions', {
        error,
        count: permissions.length,
      });
      throw error;
    }
  }

  async bulkDelete(permissionIds: string[]): Promise<void> {
    try {
      await this.prisma.permission.deleteMany({
        where: { id: { in: permissionIds } },
      });

      this.logger.info('Bulk permission deletion completed', {
        count: permissionIds.length,
      });
    } catch (error) {
      this.logger.error('Failed to bulk delete permissions', {
        error,
        permissionIds,
      });
      throw error;
    }
  }

  async getStats(): Promise<{
    total: number;
    wildcardPermissions: number;
    administrativePermissions: number;
    averageScopeLevel: number;
    resourceCount: number;
    actionCount: number;
    mostUsedPermissions: Array<{
      permissionId: string;
      name: string;
      roleCount: number;
    }>;
  }> {
    try {
      const [
        total,
        allPermissions,
        resourceCount,
        actionCount,
        permissionUsage,
      ] = await Promise.all([
        this.prisma.permission.count(),
        this.prisma.permission.findMany(),
        this.prisma.permission.findMany({
          select: { resource: true },
          distinct: ['resource'],
        }),
        this.prisma.permission.findMany({
          select: { action: true },
          distinct: ['action'],
        }),
        this.prisma.permission.findMany({
          include: {
            roles: true,
          },
        }),
      ]);

      const permissions = allPermissions.map((p: any) =>
        this.mapToPermission(p)
      );

      const wildcardPermissions = permissions.filter((p) =>
        p.isWildcard()
      ).length;
      const administrativePermissions = permissions.filter((p) =>
        p.isAdministrative()
      ).length;

      const totalScopeLevel = permissions.reduce(
        (sum, p) => sum + p.getScopeLevel(),
        0
      );
      const averageScopeLevel = total > 0 ? totalScopeLevel / total : 0;

      const mostUsedPermissions = permissionUsage
        .map((p: any) => ({
          permissionId: p.id,
          name: p.name,
          roleCount: p.roles.length,
        }))
        .sort((a, b) => b.roleCount - a.roleCount)
        .slice(0, 5);

      return {
        total,
        wildcardPermissions,
        administrativePermissions,
        averageScopeLevel: Math.round(averageScopeLevel * 100) / 100,
        resourceCount: resourceCount.length,
        actionCount: actionCount.length,
        mostUsedPermissions,
      };
    } catch (error) {
      this.logger.error('Failed to get permission stats', { error });
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const permission = await this.prisma.permission.findUnique({
        where: { id },
        select: { id: true },
      });
      return permission !== null;
    } catch (error) {
      this.logger.error('Failed to check permission existence', { error, id });
      throw error;
    }
  }

  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    try {
      const where: any = { name };
      if (excludeId) {
        where.id = { not: excludeId };
      }

      const permission = await this.prisma.permission.findFirst({
        where,
        select: { id: true },
      });
      return permission !== null;
    } catch (error) {
      this.logger.error('Failed to check permission name existence', {
        error,
        name,
        excludeId,
      });
      throw error;
    }
  }

  async findConflicts(permissionId: string): Promise<
    Array<{
      permissionId: string;
      name: string;
      reason: string;
    }>
  > {
    try {
      const permission = await this.findById(permissionId);
      if (!permission) return [];

      // Find permissions with same resource and action but different conditions
      const potentialConflicts = await this.findByResourceAndAction(
        permission.resource,
        permission.action
      );

      const conflicts: Array<{
        permissionId: string;
        name: string;
        reason: string;
      }> = [];

      for (const other of potentialConflicts) {
        if (other.id !== permission.id && permission.conflictsWith(other)) {
          conflicts.push({
            permissionId: other.id,
            name: other.name,
            reason: 'Same resource and action with different conditions',
          });
        }
      }

      return conflicts;
    } catch (error) {
      this.logger.error('Failed to find permission conflicts', {
        error,
        permissionId,
      });
      throw error;
    }
  }
}
