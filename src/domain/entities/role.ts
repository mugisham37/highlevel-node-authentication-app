/**
 * Role Domain Entity
 * Represents a role in the RBAC system with hierarchical permissions
 */

import { Permission } from './permission';

export interface RoleProps {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: Permission[];
}

export class Role {
  private readonly _id: string;
  private _name: string;
  private _description: string | undefined;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _permissions: Permission[];

  constructor(props: RoleProps) {
    this.validateProps(props);

    this._id = props.id;
    this._name = props.name;
    this._description = props.description;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._permissions = [...props.permissions];
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get name(): string {
    return this._name;
  }
  get description(): string | undefined {
    return this._description;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  get permissions(): Permission[] {
    return [...this._permissions];
  }

  /**
   * Check if the role has a specific permission
   */
  hasPermission(permissionName: string): boolean {
    return this._permissions.some(
      (permission) => permission.name === permissionName
    );
  }

  /**
   * Check if the role has permission for a specific resource and action
   */
  hasResourcePermission(
    resource: string,
    action: string,
    context?: Record<string, any>
  ): boolean {
    return this._permissions.some((permission) =>
      permission.matches(resource, action, context)
    );
  }

  /**
   * Add a permission to the role
   */
  addPermission(permission: Permission): void {
    if (this.hasPermission(permission.name)) {
      throw new Error(
        `Permission ${permission.name} already exists in role ${this._name}`
      );
    }

    this._permissions.push(permission);
    this._updatedAt = new Date();
  }

  /**
   * Remove a permission from the role
   */
  removePermission(permissionId: string): void {
    const index = this._permissions.findIndex((p) => p.id === permissionId);
    if (index === -1) {
      throw new Error(
        `Permission with ID ${permissionId} not found in role ${this._name}`
      );
    }

    this._permissions.splice(index, 1);
    this._updatedAt = new Date();
  }

  /**
   * Update role information
   */
  updateInfo(updates: { name?: string; description?: string }): void {
    if (updates.name !== undefined) {
      this.validateName(updates.name);
      this._name = updates.name;
    }

    if (updates.description !== undefined) {
      this.validateDescription(updates.description);
      this._description = updates.description;
    }

    this._updatedAt = new Date();
  }

  /**
   * Get all permissions for a specific resource
   */
  getResourcePermissions(resource: string): Permission[] {
    return this._permissions.filter(
      (permission) => permission.resource === resource
    );
  }

  /**
   * Get all unique resources this role has permissions for
   */
  getResources(): string[] {
    const resources = new Set(this._permissions.map((p) => p.resource));
    return Array.from(resources);
  }

  /**
   * Get all unique actions this role can perform
   */
  getActions(): string[] {
    const actions = new Set(this._permissions.map((p) => p.action));
    return Array.from(actions);
  }

  /**
   * Check if this is a system role (built-in, non-deletable)
   */
  isSystemRole(): boolean {
    const systemRoles = ['admin', 'user', 'guest', 'moderator'];
    return systemRoles.includes(this._name.toLowerCase());
  }

  /**
   * Check if this is an admin role
   */
  isAdminRole(): boolean {
    return (
      this._name.toLowerCase() === 'admin' ||
      this.hasResourcePermission('*', '*') ||
      this.hasPermission('admin:*')
    );
  }

  /**
   * Get role hierarchy level (higher number = more permissions)
   */
  getHierarchyLevel(): number {
    if (this.isAdminRole()) return 100;

    // Calculate based on permission count and scope
    let level = this._permissions.length;

    // Bonus for wildcard permissions
    const wildcardPermissions = this._permissions.filter(
      (p) => p.resource === '*' || p.action === '*'
    );
    level += wildcardPermissions.length * 10;

    // Bonus for administrative permissions
    const adminPermissions = this._permissions.filter(
      (p) => p.name.startsWith('admin:') || p.resource.includes('admin')
    );
    level += adminPermissions.length * 5;

    return Math.min(99, level); // Cap at 99 (admin is 100)
  }

  /**
   * Check if this role can be assigned to users
   */
  canBeAssigned(): boolean {
    // System roles might have restrictions
    if (this.isSystemRole() && this.isAdminRole()) {
      return false; // Admin role requires special assignment
    }

    return true;
  }

  /**
   * Get role summary for display
   */
  getSummary(): {
    id: string;
    name: string;
    description: string | undefined;
    permissionCount: number;
    resources: string[];
    isSystemRole: boolean;
    isAdminRole: boolean;
    hierarchyLevel: number;
  } {
    return {
      id: this._id,
      name: this._name,
      description: this._description,
      permissionCount: this._permissions.length,
      resources: this.getResources(),
      isSystemRole: this.isSystemRole(),
      isAdminRole: this.isAdminRole(),
      hierarchyLevel: this.getHierarchyLevel(),
    };
  }

  /**
   * Create audit summary for logging
   */
  createAuditSummary(): {
    roleId: string;
    name: string;
    permissionCount: number;
    isSystemRole: boolean;
    hierarchyLevel: number;
  } {
    return {
      roleId: this._id,
      name: this._name,
      permissionCount: this._permissions.length,
      isSystemRole: this.isSystemRole(),
      hierarchyLevel: this.getHierarchyLevel(),
    };
  }

  /**
   * Compare roles by hierarchy level
   */
  isHigherThan(other: Role): boolean {
    return this.getHierarchyLevel() > other.getHierarchyLevel();
  }

  /**
   * Check if this role includes all permissions of another role
   */
  includes(other: Role): boolean {
    return other._permissions.every((otherPermission) =>
      this._permissions.some(
        (thisPermission) => thisPermission.name === otherPermission.name
      )
    );
  }

  /**
   * Get permissions that this role has but another role doesn't
   */
  getAdditionalPermissions(other: Role): Permission[] {
    return this._permissions.filter(
      (thisPermission) =>
        !other._permissions.some(
          (otherPermission) => otherPermission.name === thisPermission.name
        )
    );
  }

  private validateProps(props: RoleProps): void {
    if (!props.id || typeof props.id !== 'string') {
      throw new Error('Role ID must be a non-empty string');
    }

    this.validateName(props.name);

    if (props.description !== undefined) {
      this.validateDescription(props.description);
    }

    if (!(props.createdAt instanceof Date)) {
      throw new Error('Created at must be a Date');
    }

    if (!(props.updatedAt instanceof Date)) {
      throw new Error('Updated at must be a Date');
    }

    if (!Array.isArray(props.permissions)) {
      throw new Error('Permissions must be an array');
    }

    // Validate all permissions are Permission instances
    props.permissions.forEach((permission, index) => {
      if (!(permission instanceof Permission)) {
        throw new Error(
          `Permission at index ${index} must be a Permission instance`
        );
      }
    });
  }

  private validateName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Role name must be a non-empty string');
    }

    if (name.length < 2) {
      throw new Error('Role name must be at least 2 characters long');
    }

    if (name.length > 50) {
      throw new Error('Role name cannot be longer than 50 characters');
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        'Role name can only contain letters, numbers, underscores, and hyphens'
      );
    }

    // Check for reserved names
    const reservedNames = ['null', 'undefined', 'admin', 'root', 'system'];
    if (reservedNames.includes(name.toLowerCase())) {
      throw new Error(`Role name "${name}" is reserved`);
    }
  }

  private validateDescription(description: string): void {
    if (typeof description !== 'string') {
      throw new Error('Role description must be a string');
    }

    if (description.length > 500) {
      throw new Error('Role description cannot be longer than 500 characters');
    }

    // Check for potentially malicious content
    if (/<script|javascript:|data:/i.test(description)) {
      throw new Error('Role description contains invalid content');
    }
  }

  equals(other: Role): boolean {
    return this._id === other._id;
  }

  toJSON(): any {
    return {
      id: this._id,
      name: this._name,
      description: this._description,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      permissions: this._permissions.map((p) => p.toJSON()),
      permissionCount: this._permissions.length,
      isSystemRole: this.isSystemRole(),
      isAdminRole: this.isAdminRole(),
      hierarchyLevel: this.getHierarchyLevel(),
    };
  }
}
