const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Get the default Metro config
const defaultConfig = getDefaultConfig(__dirname);

// Define the monorepo root
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Custom configuration for monorepo support
const config = {
  // Watch all files in the monorepo
  watchFolders: [monorepoRoot],

  resolver: {
    // Resolve modules from the monorepo root and project root
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],

    // Support for workspace packages
    alias: {
      '@company/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
      '@company/api-contracts': path.resolve(monorepoRoot, 'packages/api-contracts/src'),
    },

    // Ensure we can resolve TypeScript files
    sourceExts: [...defaultConfig.resolver.sourceExts, 'ts', 'tsx'],
  },

  transformer: {
    // Use the default transformer with additional options
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },

  // Reset the cache when the configuration changes
  resetCache: true,
};

module.exports = mergeConfig(defaultConfig, config);
