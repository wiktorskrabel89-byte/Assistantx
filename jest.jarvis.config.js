/**
 * Standalone Jest config for the Jarvis desktop (Electron) unit tests.
 *
 * The root jest.config.ts goes through next/jest, which drags in the Next.js
 * toolchain and is unnecessary for the plain-CommonJS desktop modules. CI's
 * voice-pipeline job runs exactly this config:
 *
 *   npx jest -c jest.jarvis.config.js
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  // testRegex instead of testMatch: jest's <rootDir> glob interpolation
  // breaks when the checkout path contains a dot-directory on Windows
  // (the path separator before `.claude` survives as a glob escape).
  // A regex matches the same files reliably on every platform.
  testRegex: ['__tests__[\\\\/]jarvis[\\\\/].*\\.test\\.[jt]s$'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    // These two need the next/jest SWC transform (react-native modules) or a
    // native sql.js runtime; they stay covered by the root jest.config.ts.
    'android-updater.test.js',
    'launcher-catalog.test.js',
  ],
};
