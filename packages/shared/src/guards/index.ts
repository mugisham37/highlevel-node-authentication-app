import { Permission, UserRole } from '../enums';
import { AuthUser } from '../interfaces';

// Type guards
export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value);
};

export const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

export const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isArray = (value: unknown): value is unknown[] => {
  return Array.isArray(value);
};

export const isDate = (value: unknown): value is Date => {
  return value instanceof Date && !isNaN(value.getTime());
};

export const isUuid = (value: unknown): value is string => {
  if (!isString(value)) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

export const isEmail = (value: unknown): value is string => {
  if (!isString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
};

// Authentication guards
export const isAuthenticatedUser = (user: unknown): user is AuthUser => {
  return (
    isObject(user) &&
    isString(user.id) &&
    isString(user.email) &&
    isArray(user.roles) &&
    isArray(user.permissions) &&
    user.roles.every(isString) &&
    user.permissions.every(isString)
  );
};

export const hasRole = (user: AuthUser, role: UserRole): boolean => {
  return user.roles.includes(role);
};

export const hasPermission = (user: AuthUser, permission: Permission): boolean => {
  return user.permissions.includes(permission);
};

export const hasAnyRole = (user: AuthUser, roles: UserRole[]): boolean => {
  return roles.some(role => user.roles.includes(role));
};

export const hasAnyPermission = (user: AuthUser, permissions: Permission[]): boolean => {
  return permissions.some(permission => user.permissions.includes(permission));
};

export const hasAllRoles = (user: AuthUser, roles: UserRole[]): boolean => {
  return roles.every(role => user.roles.includes(role));
};

export const hasAllPermissions = (user: AuthUser, permissions: Permission[]): boolean => {
  return permissions.every(permission => user.permissions.includes(permission));
};

// Admin guards
export const isAdmin = (user: AuthUser): boolean => {
  return hasRole(user, UserRole.ADMIN);
};

export const isModerator = (user: AuthUser): boolean => {
  return hasRole(user, UserRole.MODERATOR);
};

export const isAdminOrModerator = (user: AuthUser): boolean => {
  return hasAnyRole(user, [UserRole.ADMIN, UserRole.MODERATOR]);
};

// Resource ownership guards
export const isResourceOwner = (user: AuthUser, resourceUserId: string): boolean => {
  return user.id === resourceUserId;
};

export const canAccessResource = (user: AuthUser, resourceUserId: string): boolean => {
  return isAdmin(user) || isResourceOwner(user, resourceUserId);
};

// Validation guards
export const isNonEmptyString = (value: unknown): value is string => {
  return isString(value) && value.trim().length > 0;
};

export const isPositiveNumber = (value: unknown): value is number => {
  return isNumber(value) && value > 0;
};

export const isNonNegativeNumber = (value: unknown): value is number => {
  return isNumber(value) && value >= 0;
};

export const isValidUrl = (value: unknown): value is string => {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};