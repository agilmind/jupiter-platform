/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const { getMetroConfig } = require('@nx/react-native');
const { resolve, join } = require('path');

module.exports = (async () => {
  const config = await getMetroConfig();
  const monorepoRoot = resolve(__dirname, '../../..');
  const projectRoot = __dirname;

  return {
    ...config,
    projectRoot,
    watchFolders: [monorepoRoot],
    resolver: {
      ...config.resolver,
      extraNodeModules: {
        '@jupiter/api-interfaces': join(monorepoRoot, 'libs/jupiter/api-interfaces'),
        '@jupiter/shared': join(monorepoRoot, 'libs/jupiter/shared'),
      },
    },
    transformer: {
      ...config.transformer,
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      }),
    },
  };
})();
