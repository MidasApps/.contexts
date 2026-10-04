import { type AdminUserSummary, AdminUserSummarySchema } from "@core/contracts";
import { type Page, type PageRequest, paginateInMemory } from "#/services/shared/pagination/page.ts";
import { normalizeSearchText } from "#/services/shared/text/search-text.ts";
import type { AdminUserDirectory } from "../../application/ports/admin-user-directory.ts";

export type AdminUserSeed = {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly status?: "active" | "disabled";
  readonly createdAt?: string | null;
};

export type InMemoryAdminUserDirectory = AdminUserDirectory & {
  /** Every call made, so a test can count round trips. */
  readonly reads: { kind: string; count: number }[];
};

/** In-memory `AdminUserDirectory` for unit tests. */
export const createInMemoryAdminUserDirectory = (seed: readonly AdminUserSeed[]): InMemoryAdminUserDirectory => {
  const users: AdminUserSummary[] = seed.map((user) =>
    AdminUserSummarySchema.parse({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status ?? "active",
      createdAt: user.createdAt ?? "2026-09-29T14:30:00.000Z",
    }),
  );
  const reads: { kind: string; count: number }[] = [];
  const byPrefix = (
    kind: string,
    valueOf: (user: AdminUserSummary) => string,
    args: { prefix: string; page: PageRequest },
  ): Promise<Page<AdminUserSummary>> => {
    reads.push({ kind, count: 1 });
    const items = users.filter((user) => valueOf(user) !== "" && valueOf(user).startsWith(args.prefix));
    return Promise.resolve(
      paginateInMemory({ items, page: args.page, positionOf: (user) => [valueOf(user), user.id] }),
    );
  };
  return {
    reads,
    searchByName: (args) => byPrefix("searchByName", (user) => normalizeSearchText(user.displayName), args),
    searchByEmail: (args) => byPrefix("searchByEmail", (user) => user.email ?? "", args),
    getMany: (ids) => {
      reads.push({ kind: "getMany", count: ids.length });
      return Promise.resolve(ids.flatMap((id) => users.filter((user) => user.id === id)));
    },
  };
};
