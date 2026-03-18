const globals = require("globals");

module.exports = [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "error",
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
    files: ["src/renderer.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        crypto: "readonly"
      }
    }
  },
  {
    ignores: ["node_modules/", "dist/", "downloads/"]
  }
];
