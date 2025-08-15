/**
 * Fastify Extensions
 * Type declarations for Fastify plugins and extensions
 */

import { FastifyRequest as OriginalFastifyRequest, FastifyReply as OriginalFastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    cookies: Record<string, string>;
    user?: {
      id: string;
      email: string;
      [key: string]: any;
    };
    session?: {
      id: string;
      [key: string]: any;
    };
    correlationId?: string;
  }

  interface FastifyReply {
    setCookie(name: string, value: string, options?: {
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: 'strict' | 'lax' | 'none';
      domain?: string;
      path?: string;
    }): void;
    clearCookie(name: string, options?: {
      domain?: string;
      path?: string;
    }): void;
  }
}
