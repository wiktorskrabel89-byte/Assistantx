import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Relative glob — keep this OFF <rootDir> because Windows worktree paths
  // containing literal dots (e.g. ".claude") break the haste-map glob
  // substitution and silently yield 0 matches even on existing tests.
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/\\.next/", "/e2e/", "/\\.claude/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Redirect ESM dist of react-syntax-highlighter to CJS equivalent
    "^react-syntax-highlighter/dist/esm/(.*)$": "react-syntax-highlighter/dist/cjs/$1",
  },
};

export default createJestConfig(config);
