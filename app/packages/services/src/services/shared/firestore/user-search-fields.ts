import { normalizeSearchText } from "../text/search-text.ts";

/**
 * Storage-only field of `users/{uid}` (decision 0044): the display name as the staff search
 * compares it. It is not part of the `identity.User` contract, so reads drop it.
 */
export const USER_SEARCH_NAME_FIELD = "searchName";

/**
 * The search fields every writer of a user's display name stores with it (identity's `ensure` and
 * `updateProfile`, access's `create`), so the name and its searchable form never drift.
 * @example tx.update(ref, { displayName, ...userSearchFields(displayName) })
 */
export const userSearchFields = (displayName: string): { readonly searchName: string } => ({ [USER_SEARCH_NAME_FIELD]: normalizeSearchText(displayName) });
