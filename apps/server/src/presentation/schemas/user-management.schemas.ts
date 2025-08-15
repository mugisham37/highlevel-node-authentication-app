/**
 * User Management API Validation Schemas
 * Zod schemas for request/response validation in user management endpoints
 */

import { z } from 'zod';

// User Creation Schema
export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').optional(),
  image: z.string().url('Invalid image URL').optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .optional(),
  emailVerified: z.boolean().optional().default(false),
  roles: z.array(z.string()).optional().default([]),
});

// User Update Schema
export const UpdateUserSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  image: z.string().url('Invalid image URL').optional(),
  email: z.string().email('Invalid email format').optional(),
  emailVerified: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
});

// User Query Schema
export const UserQuerySchema = z.object({
  search: z.string().optional(),
  mfaEnabled: z.enum(['true', 'false']).optional(),
  locked: z.enum(['true', 'false']).optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
  roles: z.union([z.string(), z.array(z.string())]).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  riskScoreMin: z.number().min(0).max(100).optional(),
  riskScoreMax: z.number().min(0).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  sortBy: z
    .enum(['createdAt', 'lastLoginAt', 'email', 'name', 'riskScore'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// User Search Schema
export const UserSearchSchema = z.object({
  query: z.string().min(2, 'Search query must be at least 2 characters'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

// Role Assignment Schema
export const RoleAssignmentSchema = z.object({
  roleId: z.string().min(1, 'Role ID is required'),
});

// Bulk User Creation Schema
export const BulkCreateUsersSchema = z.object({
  users: z
    .array(CreateUserSchema)
    .min(1, 'At least one user is required')
    .max(1000, 'Maximum 1000 users allowed'),
});

// User Lock Schema
export const UserLockSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

// User Export Query Schema
export const UserExportQuerySchema = z.object({
  search: z.string().optional(),
  mfaEnabled: z.enum(['true', 'false']).optional(),
  locked: z.enum(['true', 'false']).optional(),
  emailVerified: z.enum(['true', 'false']).optional(),
  roles: z.union([z.string(), z.array(z.string())]).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  format: z.enum(['json', 'csv', 'xlsx']).optional().default('json'),
});

// Response Schemas
export const UserResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
      image: z.string().nullable(),
      emailVerified: z.boolean(),
      mfaEnabled: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
      lastLoginAt: z.string().nullable(),
      riskScore: z.number().min(0).max(100),
      locked: z.boolean(),
      lockedUntil: z.string().nullable(),
      roles: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
        })
      ),
      permissions: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          resource: z.string(),
          action: z.string(),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  correlationId: z.string().optional(),
});

export const UsersListResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      users: z.array(
        z.object({
          id: z.string(),
          email: z.string(),
          name: z.string().nullable(),
          image: z.string().nullable(),
          emailVerified: z.boolean(),
          mfaEnabled: z.boolean(),
          createdAt: z.string(),
          lastLoginAt: z.string().nullable(),
          riskScore: z.number().min(0).max(100),
          locked: z.boolean(),
          roles: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
            })
          ),
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

export const BulkOperationResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    processed: z.number(),
    successful: z.number(),
    failed: z.number(),
    errors: z.array(
      z.object({
        index: z.number(),
        email: z.string(),
        error: z.string(),
      })
    ),
  }),
  message: z.string(),
});

export const UserStatsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    totalUsers: z.number(),
    activeUsers: z.number(),
    lockedUsers: z.number(),
    verifiedUsers: z.number(),
    mfaEnabledUsers: z.number(),
    newUsersToday: z.number(),
    newUsersThisWeek: z.number(),
    newUsersThisMonth: z.number(),
    averageRiskScore: z.number(),
    highRiskUsers: z.number(),
  }),
});

// Type exports
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type UserQuery = z.infer<typeof UserQuerySchema>;
export type UserSearch = z.infer<typeof UserSearchSchema>;
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;
export type BulkCreateUsers = z.infer<typeof BulkCreateUsersSchema>;
export type UserLock = z.infer<typeof UserLockSchema>;
export type UserExportQuery = z.infer<typeof UserExportQuerySchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UsersListResponse = z.infer<typeof UsersListResponseSchema>;
export type BulkOperationResponse = z.infer<typeof BulkOperationResponseSchema>;
export type UserStatsResponse = z.infer<typeof UserStatsResponseSchema>;
