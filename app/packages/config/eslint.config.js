import { createCoreConfig } from "./eslint/index.js";

// ESLint's flat config loader requires a default export.
export default createCoreConfig({ tsconfigRootDir: import.meta.dirname });
