// Link policy for model-written markdown (SP4 spec §6, rules/security.md "LLM output"): the model
// is untrusted, so only absolute http(s) links survive, and the reader always sees the real host.

/** A link that may be rendered: the normalized href and the host shown next to its text. */
export type SafeLink = { readonly href: string; readonly host: string };

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * The link to render for an href written by the model, or `null` to render its text only.
 * Rejected: every scheme but http(s) (`javascript:`, `data:`, `file:`, `mailto:`…), relative and
 * protocol-relative URLs (there is no trusted base), and URLs with credentials, whose visible
 * prefix is not the host (`https://bank.example@evil.test`).
 */
export const resolveSafeLink = (raw: string | null | undefined): SafeLink | null => {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol) || url.hostname === "") return null;
  if (url.username !== "" || url.password !== "") return null;
  // `URL` serializes internationalized hosts as punycode, so look-alike domains show as `xn--…`.
  return { href: url.href, host: url.host };
};

const CITATION_HREF = /^#cite-(\d{1,3})$/;

/** `#cite-<n>` is the only non-http href kept: an in-page citation written by our own code. */
export const isCitationHref = (href: string | null | undefined): number | null => {
  const match = CITATION_HREF.exec(href ?? "");
  return match === null ? null : Number(match[1]);
};

/** The href our own code writes for citation `n` (1-based). */
export const citationHref = (index: number): string => `#cite-${index}`;
