import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export function createConfig(rootDirectory) {
  return tseslint.config(
    {
      ignores: [
        "**/.history/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/dist/**",
        "**/node_modules/**",
      ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDirectory,
        },
      },
      rules: {
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
      },
    },
    {
      files: ["**/*.mjs", "**/*.js"],
      ...tseslint.configs.disableTypeChecked,
    },
  );
}
