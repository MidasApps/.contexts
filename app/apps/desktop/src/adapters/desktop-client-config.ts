import { type ClientConfig, parseClientConfig } from "@core/client/shared/config";
import type { DesktopEnv } from "@/config/desktop-env.schema.ts";

/**
 * The shared client config (SP2 spec §2.1) from the validated desktop env: the API lives on its
 * own origin (`VITE_API_URL`, CORS allowlisted by the web), unlike the web's same-origin `""`.
 * @throws {ClientConfigError} never for an env that passed `DesktopEnvSchema` (same rules).
 */
export const toClientConfig = (env: DesktopEnv): ClientConfig =>
  parseClientConfig({
    appEnv: env.VITE_APP_ENV,
    apiBaseUrl: env.VITE_API_URL,
    firebase: {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
    },
    ...(env.VITE_AUTH_EMULATOR_URL === undefined ? {} : { authEmulatorUrl: env.VITE_AUTH_EMULATOR_URL }),
    mfaFactors: env.VITE_MFA_FACTORS,
    ...(env.VITE_SELF_SERVE_SIGN_UP === undefined ? {} : { selfServeSignUp: env.VITE_SELF_SERVE_SIGN_UP }),
  });
