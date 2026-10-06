import { addKnowledgeSourceEndpoint, type KnowledgeSource } from "@core/contracts";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { type SendBytes, type UploadStep, uploadKnowledgeFile } from "./upload-knowledge-file.ts";

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

/** What the member chose to add: a picked file, or the address of a public page. */
export type KnowledgeDocumentChoice =
  | { readonly kind: "file"; readonly file: File }
  | { readonly kind: "url"; readonly url: string };

/**
 * Starts the ingestion of the chosen document: a file goes through the signed upload and its
 * validation first (`uploadKnowledgeFile`), a page is handed to the runtime as is (trimmed).
 * @throws {KnowledgeUploadError} when the storage or the validation refuses the file.
 * @throws {ApiError} for a failed `/v1` call.
 */
export const startKnowledgeIngestion = async (args: {
  callEndpoint: CallEndpoint;
  organizationId: string;
  projectId: string | undefined;
  choice: KnowledgeDocumentChoice;
  onStep: (step: UploadStep) => void;
  onSlow: () => void;
  sendBytes: SendBytes | undefined;
  wait: ((milliseconds: number) => Promise<void>) | undefined;
}): Promise<StartedKnowledgeIngestion> => {
  const { callEndpoint, organizationId, projectId, choice } = args;
  if (choice.kind === "file") {
    const { file } = choice;
    const { runId, fileId, source } = await uploadKnowledgeFile({
      callEndpoint,
      organizationId,
      projectId,
      file,
      onStep: args.onStep,
      onSlow: args.onSlow,
      sendBytes: args.sendBytes,
      wait: args.wait,
    });
    return { runId, label: file.name, sourceRef: fileId, projectId, source };
  }
  const address = choice.url.trim();
  const source: KnowledgeSource = { kind: "url", url: address };
  const started = await callEndpoint(addKnowledgeSourceEndpoint, {
    params: { organizationId },
    query: projectId === undefined ? {} : { projectId },
    body: source,
  });
  return { runId: started.data.runId, label: address, sourceRef: address, projectId, source };
};
