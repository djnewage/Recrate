const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project root (monorepo root)
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Map workspace packages to their locations
config.resolver.extraNodeModules = new Proxy(
  {
    '@recrate/waveform': path.resolve(workspaceRoot, 'packages/waveform'),
    '@recrate/shared': path.resolve(workspaceRoot, 'packages/shared'),
  },
  {
    get: (target, name) => {
      if (target.hasOwnProperty(name)) {
        return target[name];
      }
      // Fall back to standard node_modules resolution
      return path.join(projectRoot, 'node_modules', name);
    },
  }
);

// 4. Ensure TypeScript files from workspace packages are transpiled
config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx'];

module.exports = config;
