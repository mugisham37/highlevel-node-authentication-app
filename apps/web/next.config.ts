import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['@company/shared', '@company/api-contracts'],
  },

  // API proxy configuration for development
  async rewrites() {
    return [
      {
        source: '/api/trpc/:path*',
        destination:
          process.env.NODE_ENV === 'development'
            ? 'http://localhost:3001/api/trpc/:path*'
            : '/api/trpc/:path*',
      },
    ];
  },

  // Environment variables to expose to the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },

  // Transpile workspace packages
  transpilePackages: ['@company/shared', '@company/api-contracts'],
};

export default nextConfig;
