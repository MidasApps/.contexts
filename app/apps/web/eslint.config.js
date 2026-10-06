import { createReactConfig } from "@core/config/eslint";
import nextPlugin from "@next/eslint-plugin-next";

// ESLint's flat config loader requires a default export.
// React config (react, react-hooks, jsx-a11y) since the web renders the shared client (SP2).
// @next/eslint-plugin-next declares no ESLint peer and ships flat configs, so it
// runs on ESLint 9.39.5 (E3).
export default [...createReactConfig({ tsconfigRootDir: import.meta.dirname }), nextPlugin.configs["core-web-vitals"]];
