import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  plugins: [swc.vite()],
  test: {
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    include: ["src/**/*.spec.ts", "test/unit/**/*.spec.ts"],
    passWithNoTests: false,
  },
});
