import { createReactConfig } from "@core/config/eslint";

// ESLint's flat config loader requires a default export.
export default createReactConfig({ tsconfigRootDir: import.meta.dirname });
