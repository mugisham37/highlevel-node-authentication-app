/**
 * Environment configuration for the web application
 * This file validates and exports environment variables
 */

// Client-side environment variables (must be prefixed with NEXT_PUBLIC_)
export const env = {
  // API Configuration
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',

  // Application Configuration
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Fullstack Monolith',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Feature Flags
  ENABLE_DEVTOOLS: process.env.NODE_ENV === 'development',
  ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',

  // OAuth Configuration (when available)
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  GITHUB_CLIENT_ID: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
} as const;

// Validate required environment variables
const requiredEnvVars = ['API_URL'] as const;

for (const envVar of requiredEnvVars) {
  if (!env[envVar]) {
    throw new Error(`Missing required environment variable: NEXT_PUBLIC_${envVar}`);
  }
}

// Helper functions
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
