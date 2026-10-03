"use client";

import { cursorListQuery, pageQuery, queryKeys, useCallEndpoint } from "@core/client/shared/api";
import { useFormatDateTime } from "@core/client/shared/lib/format";
import { useIsSignedIn } from "@core/client/shared/lib/session";
import { Button } from "@core/client/shared/ui/atoms/Button/Button";
import { EmptyState } from "@core/client/shared/ui/molecules/EmptyState/EmptyState";
import { SectionCard } from "@core/client/shared/ui/molecules/SectionCard/SectionCard";
import { StatusPill } from "@core/client/shared/ui/molecules/StatusPill/StatusPill";
import { QuerySection } from "@core/client/widgets/page-state";
import type { Note } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { listNotesEndpoint } from "../contracts/note-endpoints.ts";

const NOTES_PAGE_LIMIT = 20;

/** `GET /v1/organizations/{organizationId}/notes`, newest first; "load more" fetches the next cursor. */
const useNotes = (organizationId: string) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...cursorListQuery<Note>({
      queryKey: queryKeys.organizationScoped(organizationId, "example-notes"),
      fetchPage: (cursor, signal) => callEndpoint(listNotesEndpoint, { params: { organizationId }, query: pageQuery(cursor, NOTES_PAGE_LIMIT), signal }),
    }),
    enabled: signedIn && organizationId !== "",
  });
};

function NoteItem({ note }: { note: Note }) {
  const t = useTranslations("example.home");
  const formatDateTime = useFormatDateTime();
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium break-words">{note.title}</span>
        {note.archivedAt === undefined ? null : <StatusPill tone="neutral">{t("notesArchived")}</StatusPill>}
      </span>
      {note.body === "" ? null : <span className="line-clamp-3 text-sm break-words text-muted-foreground">{note.body}</span>}
      <time className="text-xs text-muted-foreground" dateTime={note.createdAt}>
        {formatDateTime(note.createdAt)}
      </time>
    </li>
  );
}

/**
 * The organization's notes (follow-up #38): agents, workflows and the chat create them through the
 * note commands; this card only reads. Skeleton, error with retry, no-access on 403, empty state.
 */
export function ExampleNotesCard({ organizationId }: { organizationId: string }) {
  const t = useTranslations("example.home");
  const notes = useNotes(organizationId);
  return (
    <SectionCard title={t("notesTitle")} description={t("notesDescription")}>
      <QuerySection query={notes} loadingLabel={t("notesLoading")}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState frame="plain" headingLevel={3} title={t("notesEmptyTitle")} description={t("notesEmptyDescription")} />
          ) : (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-col divide-y divide-border">
                {items.map((note) => (
                  <NoteItem key={note.id} note={note} />
                ))}
              </ul>
              {notes.hasNextPage ? (
                <Button variant="outline" className="self-start" disabled={notes.isFetchingNextPage} onClick={() => void notes.fetchNextPage()}>
                  {t("notesLoadMore")}
                </Button>
              ) : null}
            </div>
          )
        }
      </QuerySection>
    </SectionCard>
  );
}
