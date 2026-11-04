/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  // The real `vscode` module only exists inside the extension host.
  moduleNameMapper: {
    '^vscode$': '<rootDir>/test/__mocks__/vscode.ts',
  },
};
