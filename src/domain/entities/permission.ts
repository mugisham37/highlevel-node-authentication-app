/**
 * Permission Domain Entity
 * Represents a permission in the RBAC system with resource-action-condition model
 */

export interface PermissionProps {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
  createdAt: Date;
}

export class Permission {
  private readonly _id: string;
  private readonly _name: string;
  private readonly _resource: string;
  private readonly _action: string;
  private readonly _conditions: Record<string, any> | undefined;
  private readonly _createdAt: Date;

  constructor(props: PermissionProps) {
    this.validateProps(props);

    this._id = props.id;
    this._name = props.name;
    this._resource = props.resource;
    this._action = props.action;
    this._conditions = props.conditions ? { ...props.conditions } : undefined;
    this._createdAt = props.createdAt;
  }

  // Getters
  get id(): string {
    return this._id;
  }
  get name(): string {
    return this._name;
  }
  get resource(): string {
    return this._resource;
  }
  get action(): string {
    return this._action;
  }
  get conditions(): Record<string, any> | undefined {
    return this._conditions ? { ...this._conditions } : undefined;
  }
  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Check if this permission matches a resource, action, and context
   */
  matches(
    resource: string,
    action: string,
    context?: Record<string, any>
  ): boolean {
    // Check resource match (supports wildcards)
    if (!this.matchesResource(resource)) {
      return false;
    }

    // Check action match (supports wildcards)
    if (!this.matchesAction(action)) {
      return false;
    }

    // Check conditions if they exist
    if (this._conditions && !this.matchesConditions(context)) {
      return false;
    }

    return true;
  }

  /**
   * Check if the permission applies to a specific resource
   */
  private matchesResource(resource: string): boolean {
    // Exact match
    if (this._resource === resource) {
      return true;
    }

    // Wildcard match
    if (this._resource === '*') {
      return true;
    }

    // Pattern match (e.g., "users:*" matches "users:123")
    if (this._resource.endsWith('*')) {
      const prefix = this._resource.slice(0, -1);
      return resource.startsWith(prefix);
    }

    // Hierarchical match (e.g., "admin" matches "admin:users")
    if (resource.startsWith(this._resource + ':')) {
      return true;
    }

    return false;
  }

  /**
   * Check if the permission applies to a specific action
   */
  private matchesAction(action: string): boolean {
    // Exact match
    if (this._action === action) {
      return true;
    }

    // Wildcard match
    if (this._action === '*') {
      return true;
    }

    // Pattern match (e.g., "read:*" matches "read:profile")
    if (this._action.endsWith('*')) {
      const prefix = this._action.slice(0, -1);
      return action.startsWith(prefix);
    }

    return false;
  }

  /**
   * Check if the permission conditions are satisfied by the context
   */
  private matchesConditions(context?: Record<string, any>): boolean {
    if (!this._conditions) {
      return true; // No conditions means always match
    }

    if (!context) {
      return false; // Conditions exist but no context provided
    }

    // Check each condition
    for (const [key, expectedValue] of Object.entries(this._conditions)) {
      const actualValue = context[key];

      if (!this.evaluateCondition(expectedValue, actualValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(expected: any, actual: any): boolean {
    // Handle different condition types
    if (typeof expected === 'object' && expected !== null) {
      // Complex condition object
      if (expected.operator) {
        return this.evaluateOperatorCondition(expected, actual);
      }

      // Array condition (value must be in array)
      if (Array.isArray(expected)) {
        return expected.includes(actual);
      }

      // Object equality
      return JSON.stringify(expected) === JSON.stringify(actual);
    }

    // Simple equality
    return expected === actual;
  }

  /**
   * Evaluate operator-based conditions
   */
  private evaluateOperatorCondition(condition: any, actual: any): boolean {
    const { operator, value } = condition;

    switch (operator) {
      case 'eq':
        return actual === value;
      case 'ne':
        return actual !== value;
      case 'gt':
        return actual > value;
      case 'gte':
        return actual >= value;
      case 'lt':
        return actual < value;
      case 'lte':
        return actual <= value;
      case 'in':
        return Array.isArray(value) && value.includes(actual);
      case 'nin':
        return Array.isArray(value) && !value.includes(actual);
      case 'contains':
        return typeof actual === 'string' && actual.includes(value);
      case 'startsWith':
        return typeof actual === 'string' && actual.startsWith(value);
      case 'endsWith':
        return typeof actual === 'string' && actual.endsWith(value);
      case 'regex':
        return new RegExp(value).test(actual);
      default:
        return false;
    }
  }

  /**
   * Check if this is a wildcard permission (grants broad access)
   */
  isWildcard(): boolean {
    return this._resource === '*' || this._action === '*';
  }

  /**
   * Check if this is an administrative permission
   */
  isAdministrative(): boolean {
    return (
      this._name.startsWith('admin:') ||
      this._resource.includes('admin') ||
      this._action.includes('admin') ||
      this.isWildcard()
    );
  }

  /**
   * Get the scope level of this permission (higher = more powerful)
   */
  getScopeLevel(): number {
    let level = 1;

    // Wildcard permissions are highest level
    if (this._resource === '*' && this._action === '*') {
      return 100;
    }

    if (this._resource === '*') {
      level += 50;
    }

    if (this._action === '*') {
      level += 30;
    }

    // Administrative permissions are high level
    if (this.isAdministrative()) {
      level += 20;
    }

    // Pattern permissions are medium level
    if (this._resource.includes('*') || this._action.includes('*')) {
      level += 10;
    }

    // Conditional permissions are more specific (lower level)
    if (this._conditions) {
      level = Math.max(1, level - 5);
    }

    return level;
  }

  /**
   * Get a human-readable description of this permission
   */
  getDescription(): string {
    let description = `Can ${this._action} ${this._resource}`;

    if (this._conditions) {
      const conditionDescriptions = Object.entries(this._conditions).map(
        ([key, value]) => {
          if (typeof value === 'object' && value.operator) {
            return `${key} ${value.operator} ${value.value}`;
          }
          return `${key} = ${value}`;
        }
      );
      description += ` when ${conditionDescriptions.join(' and ')}`;
    }

    return description;
  }

  /**
   * Check if this permission is more powerful than another
   */
  isMorePowerfulThan(other: Permission): boolean {
    return this.getScopeLevel() > other.getScopeLevel();
  }

  /**
   * Check if this permission conflicts with another (same resource/action but different conditions)
   */
  conflictsWith(other: Permission): boolean {
    if (this._resource !== other._resource || this._action !== other._action) {
      return false;
    }

    // Same resource and action, check if conditions are different
    const thisConditions = JSON.stringify(this._conditions || {});
    const otherConditions = JSON.stringify(other._conditions || {});

    return thisConditions !== otherConditions;
  }

  /**
   * Create a more restrictive version of this permission with additional conditions
   */
  withConditions(additionalConditions: Record<string, any>): Permission {
    const newConditions = {
      ...(this._conditions || {}),
      ...additionalConditions,
    };

    return new Permission({
      id: `${this._id}_restricted`,
      name: `${this._name}_restricted`,
      resource: this._resource,
      action: this._action,
      conditions: newConditions,
      createdAt: new Date(),
    });
  }

  private validateProps(props: PermissionProps): void {
    if (!props.id || typeof props.id !== 'string') {
      throw new Error('Permission ID must be a non-empty string');
    }

    if (!props.name || typeof props.name !== 'string') {
      throw new Error('Permission name must be a non-empty string');
    }

    if (props.name.length < 2) {
      throw new Error('Permission name must be at least 2 characters long');
    }

    if (props.name.length > 100) {
      throw new Error('Permission name cannot be longer than 100 characters');
    }

    if (!props.resource || typeof props.resource !== 'string') {
      throw new Error('Permission resource must be a non-empty string');
    }

    if (!props.action || typeof props.action !== 'string') {
      throw new Error('Permission action must be a non-empty string');
    }

    if (!(props.createdAt instanceof Date)) {
      throw new Error('Created at must be a Date');
    }

    // Validate resource format
    if (!/^[a-zA-Z0-9_*:-]+$/.test(props.resource)) {
      throw new Error('Permission resource contains invalid characters');
    }

    // Validate action format
    if (!/^[a-zA-Z0-9_*:-]+$/.test(props.action)) {
      throw new Error('Permission action contains invalid characters');
    }

    // Validate conditions if present
    if (props.conditions !== undefined) {
      if (typeof props.conditions !== 'object' || props.conditions === null) {
        throw new Error('Permission conditions must be an object');
      }

      // Check for circular references
      try {
        JSON.stringify(props.conditions);
      } catch (error) {
        throw new Error('Permission conditions contain circular references');
      }
    }
  }

  equals(other: Permission): boolean {
    return this._id === other._id;
  }

  toJSON(): any {
    return {
      id: this._id,
      name: this._name,
      resource: this._resource,
      action: this._action,
      conditions: this._conditions,
      createdAt: this._createdAt,
      description: this.getDescription(),
      isWildcard: this.isWildcard(),
      isAdministrative: this.isAdministrative(),
      scopeLevel: this.getScopeLevel(),
    };
  }
}
