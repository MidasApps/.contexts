/**
 * Canonical form of an email for comparison (SP1 spec §6.2, rules/internationalization.md):
 * trimmed, NFC-composed, lower-cased (locale-independent), composed again because
 * lower-casing may decompose.
 */
export const normalizeEmail = (email: string): string => email.trim().normalize("NFC").toLowerCase().normalize("NFC");

/** Whether two emails name the same address once normalized. */
export const sameEmail = (left: string, right: string): boolean => normalizeEmail(left) === normalizeEmail(right);

/**
 * Masked email shown to an invitee before accepting: first character of the local part,
 * `***`, then the domain (`c***@example.com`).
 */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf("@");
  const first = [...email.slice(0, Math.max(at, 0))][0] ?? "";
  return `${first}***${email.slice(at)}`;
};
