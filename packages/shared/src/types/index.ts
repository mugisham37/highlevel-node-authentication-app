// Re-export all type definitions
export * from './environment';
export * from './fastify';
export * from './jest';
export * from './prisma-json.types';

// Additional shared types
export type ID = string;
export type Timestamp = Date;
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

// Utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// API types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type ContentType = 'application/json' | 'application/xml' | 'text/plain' | 'text/html' | 'multipart/form-data';

// Database types
export type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
export type SortDirection = 'asc' | 'desc';

// Authentication types
export type TokenType = 'access' | 'refresh' | 'reset' | 'verification';
export type AuthStrategy = 'local' | 'jwt' | 'oauth' | 'saml' | 'ldap';

// Event types
export type EventType = 'user.created' | 'user.updated' | 'user.deleted' | 'auth.login' | 'auth.logout';
export type EventPayload<T = any> = {
  type: EventType;
  data: T;
  timestamp: Date;
  userId?: string;
  requestId?: string;
};