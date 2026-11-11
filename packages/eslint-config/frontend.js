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
      // TypeScript sudah memeriksa identifier yang tidak terdefinisi
      // (`pnpm check-types`), sedangkan `no-undef` pada Babel parser justru
      // menandai anotasi tipe seperti `type Foo` sebagai variabel global.
      "no-undef": "off",
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
