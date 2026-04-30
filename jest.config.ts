import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  setupFilesAfterEnv: ["./src/tests/setup.ts"],
  testTimeout: 30000,
};

export default config;
