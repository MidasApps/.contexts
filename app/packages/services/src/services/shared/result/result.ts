/**
 * Outcome of a use case with expected domain errors (rules/error-handling.md):
 * the caller narrows on `ok`; `throw` stays for bugs and infrastructure failures.
 */
export type Result<T, E> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(data: T): { readonly ok: true; readonly data: T } => ({ ok: true, data });

export const err = <E>(error: E): { readonly ok: false; readonly error: E } => ({ ok: false, error });
