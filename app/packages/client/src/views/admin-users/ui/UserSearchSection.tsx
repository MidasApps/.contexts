"use client";

import { AdminUserSearchBySchema, type AdminUserSummary } from "@core/contracts";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { ADMIN_USERS_PAGE_LIMIT, adminUserLabel, AdminUserStatusPill, useAdminUserSearch, type AdminUserSearch } from "#/entities/admin-user/index.ts";
import { useCursorPages } from "#/shared/lib/pagination/use-cursor-pages.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SearchField } from "#/shared/ui/molecules/SearchField/SearchField.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { DataTable } from "#/shared/ui/organisms/DataTable/DataTable.tsx";
import { dataTableColumnHelper } from "#/shared/ui/organisms/DataTable/data-table-columns.ts";
import { AdminQuerySection } from "#/widgets/admin-nav/index.ts";

const AUTO = "auto";
const MAX_QUERY = 200;
const column = dataTableColumnHelper<AdminUserSummary>();

export type UserSearchSectionProps = {
  /** Present when the viewer may start support access: each row then offers "select". */
  onSelect?: ((user: AdminUserSummary) => void) | undefined;
  selectedId?: string | undefined;
};

function UserName({ user }: { user: AdminUserSummary }) {
  const t = useTranslations("admin.users.search");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{user.displayName.trim() === "" ? t("noName") : user.displayName}</span>
      <span className="font-mono text-[11.5px] break-all text-muted-foreground">{user.id}</span>
    </span>
  );
}

function UserEmail({ user }: { user: AdminUserSummary }) {
  const t = useTranslations("admin.users.search");
  return user.email === null ? <span className="text-muted-foreground">{t("noEmail")}</span> : <span className="break-all">{user.email}</span>;
}

function SelectUser({ user, selected, onSelect }: { user: AdminUserSummary; selected: boolean; onSelect: (user: AdminUserSummary) => void }) {
  const t = useTranslations("admin.users.search");
  const name = adminUserLabel(user);
  return (
    <Button variant={selected ? "secondary" : "outline"} size="sm" aria-pressed={selected} disabled={user.status === "disabled"} onClick={() => onSelect(user)} aria-label={t("selectNamed", { name })}>
      {selected ? t("selected") : t("select")}
    </Button>
  );
}

const useColumns = ({ onSelect, selectedId }: UserSearchSectionProps) => {
  const t = useTranslations("admin.users.search");
  return useMemo(
    () => [
      column.display({ id: "user", header: () => t("columns.user"), cell: ({ row }) => <UserName user={row.original} /> }),
      column.display({ id: "email", header: () => t("columns.email"), cell: ({ row }) => <UserEmail user={row.original} /> }),
      column.accessor("status", { header: () => t("columns.status"), cell: ({ getValue }) => <AdminUserStatusPill status={getValue()} /> }),
      ...(onSelect === undefined
        ? []
        : [
            column.display({
              id: "actions",
              header: () => t("columns.actions"),
              meta: { headerHidden: true },
              cell: ({ row }) => <SelectUser user={row.original} selected={row.original.id === selectedId} onSelect={onSelect} />,
            }),
          ]),
    ],
    [onSelect, selectedId, t],
  );
};

function Results({ search, onSelect, selectedId }: UserSearchSectionProps & { search: AdminUserSearch }) {
  const t = useTranslations("admin.users.search");
  const users = useAdminUserSearch(search);
  const paged = useCursorPages(users, ADMIN_USERS_PAGE_LIMIT, t("pagination"));
  const columns = useColumns({ onSelect, selectedId });
  return (
    <AdminQuerySection query={users} loadingLabel={t("loading")} rows={3}>
      {() => (
        <DataTable
          caption={t("caption")}
          captionHidden
          columns={columns}
          data={paged.rows}
          getRowId={(user) => user.id}
          pagination={paged.pagination}
          stateHeadingLevel={3}
          renderCard={(user) => (
            <div className="flex flex-col gap-2">
              <span className="flex items-start justify-between gap-2">
                <UserName user={user} />
                <AdminUserStatusPill status={user.status} />
              </span>
              <span className="text-[13px]">
                <UserEmail user={user} />
              </span>
              {onSelect === undefined ? null : (
                <span className="self-start">
                  <SelectUser user={user} selected={user.id === selectedId} onSelect={onSelect} />
                </span>
              )}
            </div>
          )}
          empty={<EmptyState frame="plain" headingLevel={3} icon="search" title={t("noMatchTitle")} description={t("noMatchDescription")} />}
        />
      )}
    </AdminQuerySection>
  );
}

/**
 * User search of `/admin/users` (decision 0044, platform.user.read): the start of a name or of an
 * email, or a whole user id. The search runs when staff submit it, never per keystroke, and the
 * text stays out of the page URL: an email typed here is personal data.
 */
export function UserSearchSection({ onSelect, selectedId }: UserSearchSectionProps) {
  const t = useTranslations("admin.users.search");
  const ids = { query: useId(), by: useId(), hint: useId() };
  const [text, setText] = useState("");
  const [by, setBy] = useState<string>(AUTO);
  const [search, setSearch] = useState<AdminUserSearch | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const query = text.trim();
    const parsedBy = AdminUserSearchBySchema.safeParse(by);
    setSearch(query === "" ? null : { query, ...(parsedBy.success ? { by: parsedBy.data } : {}) });
  };

  return (
    <SectionCard title={t("title")} description={t("description")}>
      <form role="search" aria-label={t("title")} className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
        <div className="flex flex-col gap-1.5 sm:w-80">
          <Label id={ids.query}>{t("query")}</Label>
          <SearchField aria-labelledby={ids.query} aria-describedby={ids.hint} maxLength={MAX_QUERY} autoComplete="off" value={text} onValueChange={setText} placeholder={t("placeholder")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.by}>{t("by")}</Label>
          <Select value={by} onValueChange={setBy}>
            <SelectTrigger id={ids.by} className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>{t("byOptions.auto")}</SelectItem>
              {AdminUserSearchBySchema.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`byOptions.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          {t("submit")}
        </Button>
      </form>
      <p id={ids.hint} className="text-xs text-muted-foreground">
        {t("hint")}
      </p>
      {search === null ? (
        <EmptyState frame="plain" headingLevel={3} icon="users" title={t("idleTitle")} description={t("idleDescription")} />
      ) : (
        <Results key={`${search.by ?? AUTO}:${search.query}`} search={search} onSelect={onSelect} selectedId={selectedId} />
      )}
    </SectionCard>
  );
}
