// Public API of shared/config.
export {
  type ClientConfig,
  ClientConfigError,
  ClientConfigSchema,
  type MfaFactor,
  MfaFactorSchema,
  parseClientConfig,
} from "./client-config.schema.ts";
export { ClientConfigProvider, useClientConfig } from "./config-context.tsx";
