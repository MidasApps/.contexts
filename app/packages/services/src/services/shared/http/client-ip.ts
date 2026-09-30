const UNKNOWN_IP = "unknown";

/**
 * Client IP for per-IP rate limits. The platform front end (App Hosting / Cloud Run behind
 * Google's load balancer) appends the address it saw to `X-Forwarded-For`, so the rightmost
 * entry is the one a client cannot forge; entries to its left are client-supplied.
 * Without the header (local dev) every caller shares the `unknown` bucket.
 */
export const clientIpOf = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .at(-1);
  return last ?? request.headers.get("x-real-ip")?.trim() ?? UNKNOWN_IP;
};
