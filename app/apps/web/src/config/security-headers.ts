/** Header entry in the shape `next.config.ts` `headers()` expects. */
export type HeaderEntry = { key: string; value: string };

/** Firebase Auth endpoints the browser SDK calls (decision 0016). */
export const FIREBASE_AUTH_ORIGINS = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
] as const;

/**
 * Where the browser sends upload bytes: the V4 signed URL of `POST /v1/organizations/{id}/files`
 * (decision 0035). Only `connect-src` opens to it; nothing is loaded from it.
 */
export const FILE_UPLOAD_ORIGIN = "https://storage.googleapis.com";

export type PageCspOptions = {
  readonly isDevelopment: boolean;
  /**
   * Per-request nonce (decision 0016 §1). Without it the policy is the static fallback of §2:
   * framework bootstrap scripts are inline and need `'unsafe-inline'`.
   */
  readonly nonce?: string | undefined;
  /** Auth Emulator origin, from validated env and only in `APP_ENV=local`. */
  readonly authEmulatorOrigin?: string | undefined;
  /** Storage Emulator origin (uploads), from validated env and only in `APP_ENV=local`. */
  readonly storageEmulatorOrigin?: string | undefined;
};

const scriptSources = ({ isDevelopment, nonce }: PageCspOptions): string[] => [
  "'self'",
  ...(nonce === undefined ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`, "'strict-dynamic'"]),
  // React dev tooling only (Next CSP guide); production never allows eval.
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
];

/**
 * CSP of HTML page responses (rules/security.md §6, decision 0016). `style-src` keeps
 * `'unsafe-inline'` in both variants: Radix and sonner position overlays with inline `style`
 * attributes, which nonces cannot cover (a nonce in `style-src` would disable `'unsafe-inline'`).
 * Development adds `ws:` (HMR). `media-src` allows `blob:` for the read-aloud audio the chat
 * fetches from `/v1/voice/speech` (decision 0034); recordings and previews never load remote media.
 */
export const buildPageContentSecurityPolicy = (options: PageCspOptions): string => {
  const emulatorOrigins = [options.authEmulatorOrigin, options.storageEmulatorOrigin].filter(
    (origin): origin is string => origin !== undefined,
  );
  const connectSrc = [
    "'self'",
    ...FIREBASE_AUTH_ORIGINS,
    FILE_UPLOAD_ORIGIN,
    ...emulatorOrigins,
    ...(options.isDevelopment ? ["ws:"] : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources(options).join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
};

/** CSP of `/v1` JSON responses: nothing may load from them, nothing may frame them. */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

/**
 * Static security headers applied to every route by `next.config.ts` (rules/security.md
 * checklist). The CSP is not here: the proxy sets it per request (it needs the validated env and,
 * for pages, the nonce decision of decision 0016).
 */
export const buildSecurityHeaders = (): HeaderEntry[] => [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];
