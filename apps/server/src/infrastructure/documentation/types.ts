/**
 * Type definitions for the documentation system
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Base interfaces
export interface DocumentationOptions {
  enableDocs?: boolean;
  enableSwaggerUi?: boolean;
  customRoutePrefix?: string;
  environment?: string;
}

export interface SDKGeneratorOptions {
  language: 'javascript' | 'python' | 'curl' | 'php' | 'java' | 'csharp';
  packageName?: string;
  version?: string;
  baseUrl?: string;
}

// Swagger/OpenAPI related types
export interface SwaggerInfo {
  title: string;
  version: string;
  description?: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface SwaggerServer {
  url: string;
  description?: string;
  variables?: Record<string, any>;
}

export interface SwaggerSecurity {
  [name: string]: string[];
}

export interface SwaggerTag {
  name: string;
  description?: string;
  externalDocs?: {
    description?: string;
    url: string;
  };
}

// Extended Swagger config with custom properties
export interface ExtendedSwaggerConfig {
  swagger?: {
    info: SwaggerInfo;
    servers?: SwaggerServer[];
    tags?: SwaggerTag[];
    security?: SwaggerSecurity[];
    components?: {
      securitySchemes?: Record<string, any>;
      schemas?: Record<string, any>;
    };
  };
  openapi?: {
    info: SwaggerInfo;
    servers?: SwaggerServer[];
    tags?: SwaggerTag[];
    security?: SwaggerSecurity[];
    components?: {
      securitySchemes?: Record<string, any>;
      schemas?: Record<string, any>;
    };
  };
  mode?: 'static' | 'dynamic';
  routePrefix?: string;
  exposeRoute?: boolean;
  hiddenTag?: string;
  hideUntagged?: boolean;
  stripBasePath?: boolean;
  transform?: (swaggerObject: any) => any;
  transformSpecification?: (swaggerObject: any, request: FastifyRequest, reply: FastifyReply) => any;
}

export interface ExtendedSwaggerUIConfig {
  routePrefix?: string;
  staticCSP?: boolean;
  transformStaticCSP?: (header: string) => string;
  uiConfig?: UIConfig;
  uiHooks?: {
    onRequest?: (request: FastifyRequest, reply: FastifyReply, next: () => void) => void;
    preHandler?: (request: FastifyRequest, reply: FastifyReply, next: () => void) => void;
  };
  theme?: {
    title?: string;
    css?: Array<{
      filename: string;
      content: string;
    }>;
  };
}

export interface UIConfig {
  deepLinking?: boolean;
  displayOperationId?: boolean;
  defaultModelsExpandDepth?: number;
  defaultModelExpandDepth?: number;
  defaultModelRendering?: 'example' | 'model';
  displayRequestDuration?: boolean;
  docExpansion?: 'list' | 'full' | 'none';
  filter?: boolean | string;
  maxDisplayedTags?: number;
  operationsSorter?: 'alpha' | 'method' | ((a: any, b: any) => number);
  showExtensions?: boolean;
  showCommonExtensions?: boolean;
  tagsSorter?: 'alpha' | ((a: any, b: any) => number);
  useUnsafeMarkdown?: boolean;
  syntaxHighlight?: {
    activate?: boolean;
    theme?: string;
  };
  tryItOutEnabled?: boolean;
  layout?: string;
  validatorUrl?: string | null;
  supportedSubmitMethods?: string[];
  onComplete?: () => void;
  onFailure?: (error: any) => void;
  configUrl?: string;
  plugins?: any[];
  presets?: any[];
}

// Guide and documentation types
export interface GuideMetadata {
  title: string;
  description?: string;
  category?: string;
  order?: number;
  lastModified?: Date;
  tags?: string[];
}

export interface GuideSection {
  title: string;
  content: string;
  level: number;
  anchor: string;
}

export interface Heading {
  level: number;
  title: string;
  anchor: string;
}

export interface TableOfContents {
  title: string;
  anchor: string;
  level: number;
  children?: TableOfContents[];
}

// SDK Generation types
export interface LanguageTemplates {
  javascript: string;
  python: string;
  curl: string;
  php: string;
  java: string;
  csharp: string;
  [key: string]: string;
}

export interface SDKTemplate {
  language: string;
  extension: string;
  contentType: string;
  template: string;
}

// Postman collection types
export interface PostmanHeader {
  key: string;
  value: string;
  type: string;
  description?: string;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: Array<{
    key: string;
    value: string;
    disabled?: boolean;
  }>;
  variable?: Array<{
    key: string;
    value: string;
    description?: string;
  }>;
}

export interface PostmanAuth {
  type: string;
  bearer?: Array<{
    key: string;
    value: string;
    type: string;
  }>;
  oauth2?: Array<{
    key: string;
    value: string;
    type: string;
  }>;
}

export interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded' | 'binary' | 'graphql';
  raw?: string;
  options?: {
    raw?: {
      language: string;
    };
  };
  formdata?: Array<{
    key: string;
    value: string;
    type: 'text' | 'file';
    description?: string;
  }>;
}

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  description?: string;
  auth?: PostmanAuth;
  body?: PostmanBody;
}

export interface PostmanItem {
  name: string;
  request: PostmanRequest;
  response?: any[];
  event?: Array<{
    listen: string;
    script: {
      type: string;
      exec: string[];
    };
  }>;
}

export interface PostmanCollection {
  info: {
    name: string;
    description?: string;
    schema: string;
    version?: string;
  };
  item: PostmanItem[];
  auth?: PostmanAuth;
  event?: Array<{
    listen: string;
    script: {
      type: string;
      exec: string[];
    };
  }>;
  variable?: Array<{
    key: string;
    value: string;
    type?: string;
    description?: string;
  }>;
}

// Error types
export interface DocumentationError {
  code: string;
  message: string;
  details?: any;
}

// Utility types
export type AsyncHandler<T = any> = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<T>;

export type Handler<T = any> = (
  request: FastifyRequest,
  reply: FastifyReply
) => T;

// Route schema types
export interface RouteSchema {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema?: any;
  }>;
  requestBody?: {
    description?: string;
    required?: boolean;
    content: Record<string, any>;
  };
  responses: Record<string, {
    description: string;
    content?: Record<string, any>;
    headers?: Record<string, any>;
  }>;
}

// Content type mappings
export const CONTENT_TYPES: Record<string, string> = {
  javascript: 'application/javascript',
  python: 'text/x-python',
  curl: 'text/plain',
  php: 'application/x-php',
  java: 'text/x-java-source',
  csharp: 'text/x-csharp',
  yaml: 'text/yaml',
  json: 'application/json',
  markdown: 'text/markdown',
  html: 'text/html'
};

export const FILE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  python: 'py',
  curl: 'sh',
  php: 'php',
  java: 'java',
  csharp: 'cs',
  yaml: 'yml',
  json: 'json',
  markdown: 'md',
  html: 'html'
};

// HTTP method colors for UI
export const HTTP_METHOD_COLORS: Record<string, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  DELETE: '#f93e3e',
  PATCH: '#50e3c2',
  HEAD: '#9012fe',
  OPTIONS: '#0d5aa7'
};
