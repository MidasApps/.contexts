import { GoogleAuth } from "google-auth-library";

/**
 * Google-signed ID token for the private Mastra Cloud Run service, sent as
 * `X-Serverless-Authorization` so Cloud Run IAM checks the caller while
 * `Authorization` keeps the end user's own credential (SP3 spec §4.1).
 */
export type ServerlessIdTokenSource = {
  /** @returns the header value (`Bearer <id token>`); cached by google-auth-library until it expires. */
  readonly headerValue: () => Promise<string>;
};

/** The service account could not mint an ID token (metadata server or credentials missing). */
export class ServerlessIdTokenError extends Error {
  readonly code = "SERVERLESS_ID_TOKEN_UNAVAILABLE";

  constructor(options?: ErrorOptions) {
    super("SERVERLESS_ID_TOKEN_UNAVAILABLE: could not mint an ID token for the Mastra audience", options);
    this.name = "ServerlessIdTokenError";
  }
}

/** The part of `GoogleAuth` used here (a fake in tests). */
export type IdTokenMinter = {
  readonly getIdTokenClient: (audience: string) => Promise<{ readonly getRequestHeaders: () => Promise<Headers> }>;
};

/**
 * ID tokens from Application Default Credentials (the Cloud Run service
 * account). Used only outside `local`, where `MASTRA_AUDIENCE` is required.
 * @param audience the Mastra service URL (Cloud Run audience).
 */
export const createServerlessIdTokenSource = (args: { audience: string; auth?: IdTokenMinter }): ServerlessIdTokenSource => {
  const auth: IdTokenMinter = args.auth ?? new GoogleAuth();
  let client: ReturnType<IdTokenMinter["getIdTokenClient"]> | undefined;
  return {
    headerValue: async () => {
      try {
        client ??= auth.getIdTokenClient(args.audience);
        const headers = await (await client).getRequestHeaders();
        const value = headers.get("authorization");
        if (value === null) throw new Error("no authorization header");
        return value;
      } catch (error: unknown) {
        client = undefined;
        throw new ServerlessIdTokenError({ cause: error });
      }
    },
  };
};
