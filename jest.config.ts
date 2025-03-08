export default {
  displayName: '@jupiter-platform/source',
  preset: './jest.preset.js',
  coverageDirectory: './coverage/@jupiter-platform/source',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/*(*.)@(spec|test).[jt]s?(x)',
  ],
};
