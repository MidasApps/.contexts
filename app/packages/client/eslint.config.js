import { createReactConfig, DEEP_RELATIVE_IMPORT } from "@core/config/eslint";

// ESLint's flat config loader requires a default export.
export default [
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // `@/` resolves through the importing app's tsconfig, not this package's, so the
    // client imports its own files with `#/` (package.json `imports`, decision 0014).
    // This replaces the shared rule, so the deep-relative pattern is repeated here.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ regex: "^@/", message: "Use #/… (package imports) inside @core/client." }, DEEP_RELATIVE_IMPORT],
        },
      ],
    },
  },
];
