import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", "downloads/", "coverage/", "**/*.js", "**/*.mjs"]
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
      "no-undef": "off",
      "no-const-assign": "error",
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "warn"
    }
  },
  {
    files: ["src/renderer.ts"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        crypto: "readonly"
      }
    }
  }
);
