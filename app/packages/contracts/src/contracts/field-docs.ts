import type { PiiLevel } from "./primitives/catalog-meta.schema.ts";

/** Field meta `{ description, pii }` (decision 0005: field pii is authoritative). */
export type FieldDocs = { readonly description: string; readonly pii: PiiLevel };

/**
 * Field meta helpers, so every contract field reads `.meta(none("..."))`.
 * @example z.string().meta(personal("Display name of the user."))
 */
export const none = (description: string): FieldDocs => ({ description, pii: "none" });

/** Data about an identifiable person (LGPD default: every user datum). */
export const personal = (description: string): FieldDocs => ({ description, pii: "personal" });

/** Secrets and one-time credentials: never logged, never shown to a model. */
export const sensitive = (description: string): FieldDocs => ({ description, pii: "sensitive" });
