import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Same convention as platform/: a leading underscore marks an
      // intentionally-unused parameter (e.g. Express middleware's `next`
      // when unused, or a positional arg kept only to match a caller's
      // expected signature) rather than a mistake.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
