module.exports = {
  displayName: 'native-app',
  preset: 'react-native',
  resolver: '@nx/jest/plugins/resolver',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  moduleNameMapper: {
    '.svg': '@nx/react-native/plugins/jest/svg-mock',
  },
  transform: {
    '^.+.(js|ts|tsx)$': [
      'babel-jest',
      {
        cwd: __dirname,
        configFile: './babel.config.json',
      },
    ],
    '^.+.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      'react-native/jest/assetFileTransformer.js'
    ),
  },
};
