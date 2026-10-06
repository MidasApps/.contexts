import type { AdminUserSearchBy, AdminUserSummary } from "@core/contracts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";
import { normalizeSearchText } from "#/services/shared/text/search-text.ts";
import type { AdminUserDirectory } from "../ports/admin-user-directory.ts";

export type FindAdminUsers = (input: {
  readonly query: string;
  readonly by: AdminUserSearchBy | undefined;
  readonly page: PageRequest;
}) => Promise<Page<AdminUserSummary>>;

const EMPTY: Page<AdminUserSummary> = { items: [], nextCursor: null };
const single = (users: readonly AdminUserSummary[]): Page<AdminUserSummary> => ({
  items: users.slice(0, 1),
  nextCursor: null,
});

// A Firestore document id never holds a slash; such text can only be a name.
const mayBeUid = (query: string): boolean => !query.includes("/") && query.length <= 128;

/**
 * `GET /v1/admin/users?query=` (decision 0044). `by` picks the reading; without it the text is an
 * email prefix when it has `@`, else the user with that exact id when one exists, else a name
 * prefix. After the first page the id probe is skipped: the cursor belongs to a name search.
 */
export const makeFindAdminUsers =
  (deps: { readonly users: AdminUserDirectory }): FindAdminUsers =>
  async ({ query, by, page }) => {
    const mode = by ?? (query.includes("@") ? "email" : undefined);
    if (mode === "email") return deps.users.searchByEmail({ prefix: query.toLowerCase(), page });
    if (mode === "uid") return mayBeUid(query) ? single(await deps.users.getMany([query])) : EMPTY;
    if (mode === undefined && page.after === undefined && mayBeUid(query)) {
      const exact = await deps.users.getMany([query]);
      if (exact.length > 0) return single(exact);
    }
    const prefix = normalizeSearchText(query);
    return prefix === "" ? EMPTY : deps.users.searchByName({ prefix, page });
  };
