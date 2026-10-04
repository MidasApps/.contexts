import { type ClientConfig, parseClientConfig } from "@core/client/shared/config";

/** The public variables the browser bundle carries (all `NEXT_PUBLIC_*`, never a secret). */
export type WebPublicEnv = {
  readonly NEXT_PUBLIC_APP_ENV?: string | undefined;
  readonly NEXT_PUBLIC_FIREBASE_API_KEY?: string | undefined;
  readonly NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string | undefined;
  readonly NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string | undefined;
  readonly NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?: string | undefined;
  readonly NEXT_PUBLIC_MFA_FACTORS?: string | undefined;
  /** `true` offers open sign-up (`/sign-up`, decision 0050); unset or `false`: invitations only. */
  readonly NEXT_PUBLIC_SELF_SERVE_SIGN_UP?: string | undefined;
};

// Same default as the server's MFA_FACTORS: remote environments offer TOTP.
const DEFAULT_MFA_FACTORS = ["totp"];

const factorList = (value: string | undefined): string[] =>
  value === undefined
    ? DEFAULT_MFA_FACTORS
    : [
        ...new Set(
          value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== ""),
        ),
      ];

/**
 * The shared client config (SP2 spec §2.1) from the web's public env: `/v1` is same-origin
 * (`apiBaseUrl: ""`). The server validates the same variables at boot (`src/web-env.schema.ts`).
 * @throws {ClientConfigError} listing every invalid field.
 */
export const toWebClientConfig = (source: WebPublicEnv): ClientConfig =>
  parseClientConfig({
    appEnv: source.NEXT_PUBLIC_APP_ENV,
    apiBaseUrl: "",
    firebase: {
      apiKey: source.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: source.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: source.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    ...(source.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL === undefined
      ? {}
      : { authEmulatorUrl: source.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL }),
    mfaFactors: factorList(source.NEXT_PUBLIC_MFA_FACTORS),
    ...(source.NEXT_PUBLIC_SELF_SERVE_SIGN_UP === undefined
      ? {}
      : { selfServeSignUp: source.NEXT_PUBLIC_SELF_SERVE_SIGN_UP === "true" }),
  });

/**
 * The public env as the bundler inlines it: Next replaces each `process.env.NEXT_PUBLIC_*`
 * reference by its build-time value, so they are listed one by one (a spread would be empty).
 */
export const WEB_PUBLIC_ENV: WebPublicEnv = {
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
  NEXT_PUBLIC_MFA_FACTORS: process.env.NEXT_PUBLIC_MFA_FACTORS,
  NEXT_PUBLIC_SELF_SERVE_SIGN_UP: process.env.NEXT_PUBLIC_SELF_SERVE_SIGN_UP,
};
