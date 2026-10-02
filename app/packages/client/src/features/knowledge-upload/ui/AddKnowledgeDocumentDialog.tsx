"use client";

import { addKnowledgeSourceEndpoint, type KnowledgeSource } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { knowledgeKeys } from "#/entities/knowledge/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/shared/ui/molecules/Tabs/Tabs.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { checkKnowledgeFile, isHttpsUrl, KNOWLEDGE_EXTENSIONS, KNOWLEDGE_MAX_BYTES, type KnowledgeFileProblem } from "../model/knowledge-file-policy.ts";
import { KnowledgeUploadError, UPLOAD_STEPS, uploadKnowledgeFile, type SendBytes, type UploadStep } from "../model/upload-knowledge-file.ts";

/** Where the new document goes: the whole organization, or one project (`project:<id>`). */
export type KnowledgeUploadTarget = { readonly projectId?: string | undefined; readonly label: string };

/** A started ingestion: the workflow run to follow and what the user added. */
export type StartedKnowledgeIngestion = {
  readonly runId: string;
  readonly label: string;
  /** What the indexed document will carry as `sourceRef`: the file id or the URL. */
  readonly sourceRef: string;
  readonly projectId: string | undefined;
  /** What was sent to `POST …/knowledge/sources`, so a failed run can be started again. */
  readonly source: KnowledgeSource;
};

export type AddKnowledgeDocumentDialogProps = {
  organizationId: string;
  target: KnowledgeUploadTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: ((started: StartedKnowledgeIngestion) => void) | undefined;
  /** The viewer may upload files (core.file.upload); without it only a web page can be added. */
  fileAllowed?: boolean | undefined;
  /** Sends the bytes to the signed URL (tests inject one; the default is `fetch`). */
  sendBytes?: SendBytes | undefined;
  /** Pause between validation polls (tests pass a no-op). */
  wait?: ((milliseconds: number) => Promise<void>) | undefined;
};

type Kind = "file" | "url";
type Problem = KnowledgeFileProblem | "FILE_REQUIRED" | "URL_INVALID";

const MIB = 1024 * 1024;

function Progress({ step }: { step: UploadStep | null }) {
  const t = useTranslations("settings.knowledge.add.steps");
  if (step === null) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {t("progress", { current: UPLOAD_STEPS.indexOf(step) + 1, total: UPLOAD_STEPS.length, step: t(step) })}
    </p>
  );
}

function Failure({ error }: { error: unknown }) {
  const t = useTranslations("settings.knowledge.add.failures");
  if (error === null) return null;
  if (!(error instanceof KnowledgeUploadError)) return <ApiErrorAlert error={error} />;
  return (
    <Alert variant="destructive">
      <AlertDescription>{t(error.reason)}</AlertDescription>
    </Alert>
  );
}

function AddKnowledgeDocumentBody({ organizationId, target, onOpenChange, onAdded, sendBytes, wait, fileAllowed = true }: AddKnowledgeDocumentDialogProps) {
  const t = useTranslations("settings.knowledge.add");
  const format = useFormatter();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(fileAllowed ? "file" : "url");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [step, setStep] = useState<UploadStep | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  // Steps 1–3 (ticket, bytes, validation) run while pending: closing then would orphan the upload.
  useDialogDismissGuard(pending ? "block" : "allow");

  const problemOf = (): Problem | null => {
    if (kind === "url") return isHttpsUrl(url.trim()) ? null : "URL_INVALID";
    return file === null ? "FILE_REQUIRED" : checkKnowledgeFile(file);
  };

  const start = async (): Promise<StartedKnowledgeIngestion> => {
    const projectId = target.projectId;
    if (kind === "file" && file !== null) {
      const { runId, fileId, source } = await uploadKnowledgeFile({ callEndpoint, organizationId, projectId, file, onStep: setStep, sendBytes, wait });
      return { runId, label: file.name, sourceRef: fileId, projectId, source };
    }
    const address = url.trim();
    const source: KnowledgeSource = { kind: "url", url: address };
    const started = await callEndpoint(addKnowledgeSourceEndpoint, { params: { organizationId }, query: projectId === undefined ? {} : { projectId }, body: source });
    return { runId: started.data.runId, label: address, sourceRef: address, projectId, source };
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = problemOf();
    setProblem(found);
    setFailure(null);
    if (found !== null) return;
    setPending(true);
    try {
      const started = await start();
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.all(organizationId) });
      notify.success(t("started", { name: started.label }));
      onAdded?.(started);
      onOpenChange(false);
    } catch (error: unknown) {
      setFailure(error);
    } finally {
      setPending(false);
      setStep(null);
    }
  };

  const hint = t("fileHint", { types: format.list([...KNOWLEDGE_EXTENSIONS], { type: "conjunction" }), size: KNOWLEDGE_MAX_BYTES / MIB });
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description", { collection: target.label })}</DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Failure error={failure} />
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value === "url" ? "url" : "file");
            setProblem(null);
          }}
        >
          <TabsList aria-label={t("sourceLabel")}>
            <TabsTrigger value="file" disabled={pending || !fileAllowed}>
              {t("fileTab")}
            </TabsTrigger>
            <TabsTrigger value="url" disabled={pending}>
              {t("urlTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file">
            <FieldGroup>
              <Field>
                <FieldLabel>{t("file")}</FieldLabel>
                <FieldControl>
                  <Input type="file" required disabled={pending} accept={KNOWLEDGE_EXTENSIONS.join(",")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                </FieldControl>
                <FieldDescription>{hint}</FieldDescription>
                <FieldError errors={[kind === "file" && problem !== null ? t(`problems.${problem}`, { size: KNOWLEDGE_MAX_BYTES / MIB }) : undefined]} />
              </Field>
            </FieldGroup>
          </TabsContent>
          <TabsContent value="url">
            <FieldGroup>
              <Field>
                <FieldLabel>{t("url")}</FieldLabel>
                <FieldControl>
                  <Input type="url" required disabled={pending} inputMode="url" maxLength={2048} placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)} />
                </FieldControl>
                <FieldDescription>{t("urlHint")}</FieldDescription>
                <FieldError errors={[kind === "url" && problem !== null ? t(`problems.${problem}`, { size: KNOWLEDGE_MAX_BYTES / MIB }) : undefined]} />
              </Field>
            </FieldGroup>
          </TabsContent>
        </Tabs>
        {fileAllowed ? null : <p className="text-sm text-muted-foreground">{t("fileNotAllowed")}</p>}
        <Progress step={step} />
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" pending={pending}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Adds a document to the knowledge base (core.knowledge.write; a file also needs core.file.upload):
 * a file goes through the signed upload and its server-side validation, a public https page is
 * fetched by the runtime. Both end in the ingestion workflow, which indexes in the background.
 * The body mounts on open, so a draft or a failure never outlives the dialog.
 */
export function AddKnowledgeDocumentDialog(props: AddKnowledgeDocumentDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <AddKnowledgeDocumentBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
