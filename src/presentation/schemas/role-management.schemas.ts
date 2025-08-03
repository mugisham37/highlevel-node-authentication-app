/**
 * Role Management API Validation Schemas
 * Zod schemas for request/response validation in role management endpoints
 */

import { z } from 'zod';

// Role Creation Schema
export const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(50, 'Role name cannot exceed 50 characters'),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  permissions: z.array(z.string()).optional().default([]),
});

// Role Update Schema
export const UpdateRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(50, 'Role name cannot exceed 50 characters')
    .optional(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
});

// Role Query Schema
export const RoleQuerySchema = z.object({
  search: z.string().optional(),
  isSystemRole: z.enum(['true', 'false']).optional(),
  isAdminRole: z.enum(['true', 'false']).optional(),
  hasPermission: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  sortBy: z
    .enum(['name', 'createdAt', 'permissionCount', 'hierarchyLevel'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

// Role Search Schema
export const RoleSearchSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

// Permission Assignment Schema
export const PermissionAssignmentSchema = z.object({
  permissionId: z.string().min(1, 'Permission ID is required'),
});

// Role Validation Schema
export const RoleValidationSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  roleId: z.string().min(1, 'Role ID is required'),
});

// Response Schemas
export const RoleResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      permissions: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          resource: z.string(),
          action: z.string(),
          description: z.string(),
          isWildcard: z.boolean(),
          isAdministrative: z.boolean(),
          scopeLevel: z.string(),
          conditions: z.record(z.any()).optional(),
        })
      ),
      isSystemRole: z.boolean(),
      isAdminRole: z.boolean(),
      hierarchyLevel: z.number(),
      canBeAssigned: z.boolean(),
      summary: z
        .object({
          permissionCount: z.number(),
          resourceCount: z.number(),
          adminPermissions: z.number(),
          wildcardPermissions: z.number(),
        })
        .optional(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  correlationId: z.string().optional(),
});

export const RolesListResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      roles: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          createdAt: z.string(),
          updatedAt: z.string(),
          permissionCount: z.number(),
          isSystemRole: z.boolean(),
          isAdminRole: z.boolean(),
          hierarchyLevel: z.number(),
          canBeAssigned: z.boolean(),
        })
      ),
      pagination: z.object({
        total: z.number(),
        limit: z.number(),
        offset: z.number(),
        hasMore: z.boolean(),
      }),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const RoleHierarchyResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      role: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
      }),
      level: z.number(),
      children: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          level: z.number(),
        })
      ),
      parent: z
        .object({
          id: z.string(),
          name: z.string(),
          level: z.number(),
        })
        .optional(),
    })
  ),
});

export const RolePermissionsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      resource: z.string(),
      action: z.string(),
      description: z.string(),
      isWildcard: z.boolean(),
      isAdministrative: z.boolean(),
      scopeLevel: z.string(),
      conditions: z.record(z.any()).optional(),
    })
  ),
});

export const RoleValidationResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    valid: z.boolean(),
    reason: z.string().optional(),
    conflicts: z
      .array(
        z.object({
          type: z.string(),
          description: z.string(),
          severity: z.enum(['low', 'medium', 'high', 'critical']),
        })
      )
      .optional(),
    recommendations: z.array(z.string()).optional(),
  }),
});

export const RoleStatsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    totalRoles: z.number(),
    systemRoles: z.number(),
    customRoles: z.number(),
    adminRoles: z.number(),
    rolesWithUsers: z.number(),
    averagePermissionsPerRole: z.number(),
    mostUsedRoles: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        userCount: z.number(),
      })
    ),
    recentlyCreated: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        createdAt: z.string(),
      })
    ),
  }),
});

// Type exports
export type CreateRole = z.infer<typeof CreateRoleSchema>;
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;
export type RoleQuery = z.infer<typeof RoleQuerySchema>;
export type RoleSearch = z.infer<typeof RoleSearchSchema>;
export type PermissionAssignment = z.infer<typeof PermissionAssignmentSchema>;
export type RoleValidation = z.infer<typeof RoleValidationSchema>;
export type RoleResponse = z.infer<typeof RoleResponseSchema>;
export type RolesListResponse = z.infer<typeof RolesListResponseSchema>;
export type RoleHierarchyResponse = z.infer<typeof RoleHierarchyResponseSchema>;
export type RolePermissionsResponse = z.infer<
  typeof RolePermissionsResponseSchema
>;
export type RoleValidationResponse = z.infer<
  typeof RoleValidationResponseSchema
>;
export type RoleStatsResponse = z.infer<typeof RoleStatsResponseSchema>;
