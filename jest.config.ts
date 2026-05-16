import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/__tests__/**/*.[jt]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Redirect ESM dist of react-syntax-highlighter to CJS equivalent
    "^react-syntax-highlighter/dist/esm/(.*)$": "react-syntax-highlighter/dist/cjs/$1",
  },
};

export default createJestConfig(config);
