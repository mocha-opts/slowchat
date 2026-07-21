import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  plugins: [swc.vite()],
  test: {
    clearMocks: true,
    environment: "node",
    hookTimeout: 180_000,
    include: ["test/e2e/**/*.spec.ts"],
    passWithNoTests: false,
    pool: "forks",
    testTimeout: 120_000,
  },
});
