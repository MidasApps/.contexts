import type { AdminUserSummary } from "@core/contracts";
import type { Page, PageRequest } from "#/services/shared/pagination/page.ts";

/**
 * Staff reads over `users/{uid}` (decision 0044). Prefix searches take text that is already
 * normalized (`normalizeSearchText` for names, lowercase for emails) and page by `(value, id)`.
 */
export type AdminUserDirectory = {
  /** Users whose normalized name starts with `prefix`, by name then id. */
  readonly searchByName: (args: {
    readonly prefix: string;
    readonly page: PageRequest;
  }) => Promise<Page<AdminUserSummary>>;
  /** Users whose email starts with `prefix` (lowercase), by email then id. */
  readonly searchByEmail: (args: {
    readonly prefix: string;
    readonly page: PageRequest;
  }) => Promise<Page<AdminUserSummary>>;
  /** The users of these ids in one read, in the order given; unknown ids are absent. */
  readonly getMany: (ids: readonly string[]) => Promise<readonly AdminUserSummary[]>;
};
