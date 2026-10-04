"use client";

import type { AccessContext, KnowledgeDocument } from "@core/contracts";
import { useId, useState } from "react";
import { useTranslations } from "use-intl";
import { namespaceOfTarget, ORGANIZATION_NAMESPACE, useKnowledgeDocuments } from "#/entities/knowledge/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { DeleteKnowledgeDocumentDialog } from "#/features/delete-knowledge-document/index.ts";
import { AddKnowledgeDocumentDialog, type StartedKnowledgeIngestion } from "#/features/knowledge-upload/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { ALL_COLLECTIONS, useKnowledgeCollection } from "../model/use-knowledge-collection.ts";
import { useStartedIngestions } from "../model/use-started-ingestions.ts";
import { IngestionNotices } from "./IngestionNotices.tsx";
import { documentName, KnowledgeDocumentsTable, useCollectionName } from "./KnowledgeDocumentsTable.tsx";

/** Runs started here whose document is not in the list yet (the workflow registers it once it fetched the content). */
const stillIndexing = (
  started: readonly StartedKnowledgeIngestion[],
  documents: readonly KnowledgeDocument[],
): StartedKnowledgeIngestion[] =>
  started.filter(
    (run) =>
      !documents.some((document) => document.sourceRef === run.sourceRef || document.sourceUrl === run.sourceRef),
  );

function CollectionPicker({
  value,
  onChange,
  projects,
}: {
  value: string;
  onChange: (value: string) => void;
  projects: readonly { id: string; name: string }[];
}) {
  const t = useTranslations("settings.knowledge");
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("collectionLabel")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_COLLECTIONS}>{t("collections.all")}</SelectItem>
          <SelectItem value={ORGANIZATION_NAMESPACE}>{t("collections.organization")}</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={namespaceOfTarget(project.id)}>
              {t("collections.project", { name: project.name })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The empty list: it says how documents get here, with the add action when the viewer can add one now. */
function NoDocuments({ canWrite, onAdd }: { canWrite: boolean; onAdd: (() => void) | null }) {
  const t = useTranslations("settings.knowledge");
  return (
    <EmptyState
      frame="plain"
      headingLevel={2}
      icon="file-text"
      title={t("emptyTitle")}
      description={canWrite ? t("emptyDescription") : t("emptyDescriptionNoPermission")}
      action={onAdd === null ? undefined : <Button onClick={onAdd}>{t("addAction")}</Button>}
    />
  );
}

function SettingsKnowledge({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.knowledge");
  const online = useOnlineStatus();
  const { organization, permissions } = context;
  const collections = useKnowledgeCollection(organization.id);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const ingestions = useStartedIngestions(organization.id);
  const { started } = ingestions;
  const collectionName = useCollectionName(collections.projectNames, collections.projectsComplete);
  const allowed = permissions.includes("core.knowledge.read");
  const documents = useKnowledgeDocuments(organization.id, collections.namespace, {
    poll: started.length > 0,
    enabled: allowed,
  });
  const indexing = stillIndexing(started, documents.data ?? []);
  const canWrite = permissions.includes("core.knowledge.write");
  const canDelete = permissions.includes("core.knowledge.delete");
  return (
    <SettingsPageFrame
      width="wide"
      organizationId={organization.id}
      allowed={allowed}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
          actions={
            canWrite ? (
              <Button onClick={() => setAdding(true)} disabled={!online}>
                <Icon name="plus" />
                {t("addAction")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      {online ? null : <OfflineNotice />}
      <Alert variant="info">
        <AlertTitle>{t("collectionsNote.title")}</AlertTitle>
        <AlertDescription>{t("collectionsNote.description")}</AlertDescription>
      </Alert>
      <CollectionPicker
        value={collections.selected}
        onChange={collections.setSelected}
        projects={collections.projectOptions}
      />
      <IngestionNotices
        organizationId={organization.id}
        runs={indexing}
        followRuns={permissions.includes("core.workflow-run.read")}
        onDismiss={ingestions.dismiss}
        onRestarted={ingestions.restart}
      />
      <KnowledgeDocumentsTable
        caption={t("caption", { organization: organization.name })}
        documents={documents}
        collectionName={collectionName}
        onDelete={canDelete && online ? setDeleting : null}
        empty={<NoDocuments canWrite={canWrite} onAdd={canWrite && online ? () => setAdding(true) : null} />}
      />
      {canWrite ? (
        <AddKnowledgeDocumentDialog
          organizationId={organization.id}
          target={{ projectId: collections.uploadProjectId, label: collectionName(collections.uploadNamespace) }}
          fileAllowed={permissions.includes("core.file.upload")}
          open={adding}
          onOpenChange={setAdding}
          onAdded={ingestions.add}
        />
      ) : null}
      <DeleteKnowledgeDocumentDialog
        organizationId={organization.id}
        document={deleting}
        name={deleting === null ? "" : documentName(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/knowledge` (SP5 spec §7, core.knowledge.read): the documents agents
 * cite, with their indexing status; add a file or a public page (core.knowledge.write) and delete
 * (core.knowledge.delete). A collection is the organization or one of its projects: the runtime
 * scopes retrieval by those namespaces and has no custom named collections, and the page says so.
 */
export function SettingsKnowledgeView() {
  const t = useTranslations("settings.knowledge");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsKnowledge context={data} />}
    </QueryPage>
  );
}
