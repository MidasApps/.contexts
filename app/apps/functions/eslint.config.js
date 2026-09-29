import { createCoreConfig } from "@core/config/eslint";

// ESLint's flat config loader requires a default export.
export default [...createCoreConfig({ tsconfigRootDir: import.meta.dirname }), { ignores: ["lib/**"] }];
