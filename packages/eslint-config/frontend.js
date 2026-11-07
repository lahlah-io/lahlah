import { config as reactConfig } from "./react-internal.js";
import { frontendBoundaries } from "./rules/frontend-boundaries.js";

export const frontendConfig = [
  ...reactConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "lahlah-architecture": { rules: { boundaries: frontendBoundaries } },
    },
    rules: {
      "lahlah-architecture/boundaries": "error",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["src/pages/**/*.tsx"],
    rules: {
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
