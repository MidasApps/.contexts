const UNKNOWN_IP = "unknown";

/**
 * Default number of trusted proxies in front of the app (decision 0030 §2): App Hosting and
 * Cloud Run behind Google's front end append one `X-Forwarded-For` entry, the address they
 * saw. An external HTTPS load balancer in front adds its own entry after it (then use 2).
 * To be verified in the first remote environment (follow-up in the SP0 follow-ups list).
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Client IP for per-IP rate limits: the `X-Forwarded-For` entry appended by the outermost
 * trusted proxy, i.e. the `trustedProxyHops`-th entry from the right. Entries to its left
 * are client-supplied and ignored, and so is `X-Real-IP`. A header shorter than the trusted
 * chain, or no trusted proxy at all (local dev), puts the caller in the shared `unknown`
 * bucket: never a value the client chose.
 */
export const clientIpOf = (request: Request, options: { trustedProxyHops: number }): string => {
  const hops = options.trustedProxyHops;
  if (hops < 1) return UNKNOWN_IP;
  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return entries.length < hops ? UNKNOWN_IP : (entries.at(-hops) ?? UNKNOWN_IP);
};
