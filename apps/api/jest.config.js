/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@bp/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@bp/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@bp/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
  },
};
