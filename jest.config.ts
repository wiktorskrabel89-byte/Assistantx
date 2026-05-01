import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Redirect ESM dist of react-syntax-highlighter styles to CJS equivalent
    "^react-syntax-highlighter/dist/esm/(.*)$": "react-syntax-highlighter/dist/cjs/$1",
  },
};

export default createJestConfig(config);
