// Public API of shared/config.
export {
  ClientConfigError,
  ClientConfigSchema,
  MfaFactorSchema,
  parseClientConfig,
  type ClientConfig,
  type MfaFactor,
} from "./client-config.schema.ts";
export { ClientConfigProvider, useClientConfig } from "./config-context.tsx";
