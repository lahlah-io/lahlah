import globals from "globals";
import { config as baseConfig } from "./base.js";
import { backendBoundaries } from "./rules/backend-boundaries.js";

/**
 * ESLint configuration for the backend API app.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const backendConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "lahlah-backend": { rules: { boundaries: backendBoundaries } },
    },
    rules: {
      "lahlah-backend/boundaries": "error",
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
  {
    ignores: ["src/generated/**"],
  },
];
