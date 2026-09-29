/** Sources every webview may reach besides the API: itself and Tauri IPC (Windows uses http://ipc.localhost). */
const BASE_CONNECT_SRC = "'self' ipc: http://ipc.localhost";
/** Vite HMR socket; dev only. Must match the port in vite.config.ts and `build.devUrl`. */
const DEV_HMR_SOCKET = "ws://localhost:1420";

type ConnectSrcPatch = { "connect-src": string };

export type TauriApiConfigPatch = {
  app: { security: { csp: ConnectSrcPatch; devCsp: ConnectSrcPatch } };
};

/**
 * Tauri config merge patch (RFC 7396, `tauri dev|build --config <file>`) that
 * sets CSP `connect-src` to the API origin the bundle calls, in both `csp` and
 * `devCsp`. Only `connect-src` is replaced; every other directive stays as in
 * tauri.conf.json.
 * @param apiUrl a validated `VITE_API_URL`.
 */
export const buildTauriApiConfigPatch = (apiUrl: string): TauriApiConfigPatch => {
  const apiOrigin = new URL(apiUrl).origin;
  return {
    app: {
      security: {
        csp: { "connect-src": `${BASE_CONNECT_SRC} ${apiOrigin}` },
        devCsp: { "connect-src": `${BASE_CONNECT_SRC} ${DEV_HMR_SOCKET} ${apiOrigin}` },
      },
    },
  };
};
