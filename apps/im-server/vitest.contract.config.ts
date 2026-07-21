import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  plugins: [swc.vite()],
  test: {
    clearMocks: true,
    environment: "node",
    include: ["test/contract/**/*.spec.ts"],
    passWithNoTests: false,
  },
});
