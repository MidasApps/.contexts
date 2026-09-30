import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * SSRF guard of every outbound call the agents make (spec §8.5, §9; rules/security.md):
 * https on the default port, a DNS name (no IP literal, no single-label host), inside the
 * connector's `allowedHosts` when given, and every resolved address public. Redirects are
 * followed by hand so each hop passes the same checks.
 */

export type UrlGuardReason =
  | "INVALID_URL"
  | "HTTPS_REQUIRED"
  | "DEFAULT_PORT_REQUIRED"
  | "CREDENTIALS_IN_URL"
  | "IP_LITERAL"
  | "SINGLE_LABEL_HOST"
  | "HOST_NOT_ALLOWED"
  | "DNS_FAILED"
  | "PRIVATE_ADDRESS"
  | "TOO_MANY_REDIRECTS";

export class UrlGuardError extends Error {
  readonly code = "URL_REJECTED";
  readonly reason: UrlGuardReason;

  constructor(reason: UrlGuardReason, options?: ErrorOptions) {
    super(`url rejected: ${reason}`, options);
    this.name = "UrlGuardError";
    this.reason = reason;
  }
}

export type ResolveHost = (host: string) => Promise<readonly string[]>;

const resolveWithDns: ResolveHost = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

// Everything that is not the public internet (IANA special-purpose registries).
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv6");

/** True for loopback, private, link-local (incl. `169.254.169.254`), CGNAT, multicast and other non-public addresses. */
export const isNonPublicAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 0) return true;
  // IPv4-mapped IPv6 (`::ffff:10.0.0.1`): BlockList compares it with the IPv4 rules.
  return NON_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
};

const stripBrackets = (host: string): string => host.replace(/^\[|\]$/g, "");

const parse = (raw: string | URL): URL => {
  try {
    return new URL(raw);
  } catch (error: unknown) {
    throw new UrlGuardError("INVALID_URL", { cause: error });
  }
};

const checkShape = (url: URL, allowedHosts: readonly string[] | undefined): string => {
  if (url.protocol !== "https:") throw new UrlGuardError("HTTPS_REQUIRED");
  if (url.port !== "") throw new UrlGuardError("DEFAULT_PORT_REQUIRED");
  if (url.username !== "" || url.password !== "") throw new UrlGuardError("CREDENTIALS_IN_URL");
  const host = stripBrackets(url.hostname).toLowerCase();
  if (isIP(host) !== 0) throw new UrlGuardError("IP_LITERAL");
  if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".internal")) throw new UrlGuardError("SINGLE_LABEL_HOST");
  if (allowedHosts !== undefined && !allowedHosts.includes(host)) throw new UrlGuardError("HOST_NOT_ALLOWED");
  return host;
};

export type UrlGuardOptions = {
  /** When given, the host must be one of them (connector allowlist); otherwise any public host. */
  readonly allowedHosts?: readonly string[];
  /** DNS seam for tests; defaults to `dns.lookup(all)`. */
  readonly resolve?: ResolveHost;
};

/**
 * Checks one URL before a request.
 * @throws {UrlGuardError} with the first failed rule; DNS failures fail closed.
 */
export const assertPublicUrl = async (raw: string | URL, options: UrlGuardOptions = {}): Promise<URL> => {
  const url = parse(raw);
  const host = checkShape(url, options.allowedHosts);
  let addresses: readonly string[];
  try {
    addresses = await (options.resolve ?? resolveWithDns)(host);
  } catch (error: unknown) {
    throw new UrlGuardError("DNS_FAILED", { cause: error });
  }
  if (addresses.length === 0) throw new UrlGuardError("DNS_FAILED");
  if (addresses.some(isNonPublicAddress)) throw new UrlGuardError("PRIVATE_ADDRESS");
  return url;
};

export const MAX_REDIRECTS = 5;

export type GuardedFetchOptions = UrlGuardOptions & {
  readonly fetch?: typeof fetch;
  readonly init?: RequestInit;
};

/**
 * `fetch` with the guard on the first URL and on every redirect hop (`redirect: "manual"`).
 * A redirect drops the body and switches to GET, like browsers do for 301/302/303.
 * @throws {UrlGuardError} when a hop fails the guard or there are more than 5 redirects.
 */
export const guardedFetch = async (raw: string | URL, options: GuardedFetchOptions = {}): Promise<Response> => {
  const doFetch = options.fetch ?? fetch;
  let url = await assertPublicUrl(raw, options);
  let init: RequestInit = { ...options.init, redirect: "manual" };
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await doFetch(url, init);
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null) return response;
    await response.body?.cancel();
    url = await assertPublicUrl(new URL(location, url), options);
    init = { ...init, method: "GET", body: null };
  }
  throw new UrlGuardError("TOO_MANY_REDIRECTS");
};
