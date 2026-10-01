/** Sources every webview may reach besides the API: itself and Tauri IPC (Windows uses http://ipc.localhost). */
export const BASE_CONNECT_SRC = "'self' ipc: http://ipc.localhost";
/** Vite HMR socket; dev only. Must match the port in vite.config.ts and `build.devUrl`. */
const DEV_HMR_SOCKET = "ws://localhost:1420";
/**
 * REST origins the Firebase Auth JS SDK calls for email/password, MFA, custom-token sign-in and
 * token refresh (decision 0017 §3). No popup/redirect flow is used, so `authDomain` is never loaded.
 */
export const FIREBASE_AUTH_ORIGINS = ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"] as const;

/** Where chat uploads send their bytes: the signed URL of the files API (decision 0035). */
export const FILE_UPLOAD_ORIGIN = "https://storage.googleapis.com";

type ConnectSrcPatch = { "connect-src": string };

export type TauriApiConfigPatch = {
  app: { security: { csp: ConnectSrcPatch; devCsp: ConnectSrcPatch } };
};

export type TauriApiConfigInput = {
  /** A validated `VITE_API_URL`. */
  apiUrl: string;
  /** A validated `VITE_AUTH_EMULATOR_URL`; the env schema allows it only when `VITE_APP_ENV=local`. */
  authEmulatorUrl?: string | undefined;
  /** A validated `VITE_STORAGE_EMULATOR_URL` (local uploads); the env schema refuses it outside local. */
  storageEmulatorUrl?: string | undefined;
};

/**
 * Tauri config merge patch (RFC 7396, `tauri dev|build --config <file>`) that
 * sets CSP `connect-src` to exactly what the bundle calls: the API origin, the
 * Firebase Auth origins, the upload origin and, in local, the Auth and Storage Emulators — in both `csp` and
 * `devCsp`. Only `connect-src` is replaced; every other directive stays as in
 * tauri.conf.json.
 */
export const buildTauriApiConfigPatch = ({ apiUrl, authEmulatorUrl, storageEmulatorUrl }: TauriApiConfigInput): TauriApiConfigPatch => {
  const emulatorOrigins = [authEmulatorUrl, storageEmulatorUrl].filter((url): url is string => url !== undefined).map((url) => new URL(url).origin);
  const origins = [new URL(apiUrl).origin, ...FIREBASE_AUTH_ORIGINS, FILE_UPLOAD_ORIGIN, ...emulatorOrigins].join(" ");
  return {
    app: {
      security: {
        csp: { "connect-src": `${BASE_CONNECT_SRC} ${origins}` },
        devCsp: { "connect-src": `${BASE_CONNECT_SRC} ${DEV_HMR_SOCKET} ${origins}` },
      },
    },
  };
};
