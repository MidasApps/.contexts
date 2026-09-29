/** Header entry in the shape `next.config.ts` `headers()` expects. */
export type HeaderEntry = { key: string; value: string };

type SecurityHeadersOptions = { isDevelopment: boolean };

/**
 * Baseline static CSP (rules/security.md). Without a per-request nonce, the
 * inline scripts Next.js injects for RSC hydration need `'unsafe-inline'`; a
 * nonce-based CSP set in `src/proxy.ts` replaces this when the SP2 UI lands.
 * Development adds `'unsafe-eval'` (React dev tooling) and `ws:` (HMR) only.
 */
export const buildContentSecurityPolicy = ({ isDevelopment }: SecurityHeadersOptions): string => {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : [])];
  const connectSrc = ["'self'", ...(isDevelopment ? ["ws:"] : [])];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
};

/** Static security headers applied to every route (rules/security.md checklist). */
export const buildSecurityHeaders = (options: SecurityHeadersOptions): HeaderEntry[] => [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
];
