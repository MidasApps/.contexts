import {
  createFirebaseAdmin,
  createFirestoreFileRepository,
  createGcsObjectStore,
  createLogFileEventPublisher,
  detectContentType,
  type FinalizeOutcome,
  type FirebaseAdmin,
  filesBucketOf,
  type Logger,
  makeFinalizeUpload,
  makeObjectFinalizedHandler,
  type ObjectFinalizedData,
  systemClock,
} from "@core/services";
import type { FunctionsEnv } from "../functions-env.schema.ts";

/** Bug/misconfiguration: the runtime did not export `GCLOUD_PROJECT`. */
export class MissingProjectIdError extends Error {
  readonly code = "MISSING_PROJECT_ID";

  constructor() {
    super("GCLOUD_PROJECT is not set; the files trigger cannot reach Firestore");
    this.name = "MissingProjectIdError";
  }
}

type FinalizedEvent = { readonly id: string; readonly data: ObjectFinalizedData & { readonly bucket: string } };

/**
 * Handler of the `onFileFinalized` trigger (SP3 Task 13, umbrella §16.2): checks the
 * magic bytes and size of each object written under `tenants/{tenantId}/files/{fileId}`,
 * marks the file `ready` or `rejected`, deletes rejected objects and emits `FILE_UPLOADED`.
 * The Admin SDK and the per-bucket adapters are built on the first event, so deploy
 * analysis loads this module without touching Firebase.
 */
export const makeOnFileFinalized = (deps: {
  readonly env: FunctionsEnv;
  readonly processEnv: Record<string, string | undefined>;
  readonly logger: Logger;
}): ((event: FinalizedEvent) => Promise<FinalizeOutcome>) => {
  let firebase: FirebaseAdmin | undefined;
  const handlers = new Map<string, ReturnType<typeof makeObjectFinalizedHandler>>();
  const firebaseOf = (): FirebaseAdmin => {
    const projectId = deps.env.GCLOUD_PROJECT;
    if (projectId === undefined) throw new MissingProjectIdError();
    firebase ??= createFirebaseAdmin({
      env: { APP_ENV: deps.env.APP_ENV, FIREBASE_PROJECT_ID: projectId },
      processEnv: deps.processEnv,
    });
    return firebase;
  };
  const handlerFor = (bucketName: string) => {
    const existing = handlers.get(bucketName);
    if (existing !== undefined) return existing;
    const admin = firebaseOf();
    const finalizeUpload = makeFinalizeUpload({
      files: createFirestoreFileRepository({ firestore: admin.firestore }),
      objects: createGcsObjectStore(filesBucketOf(admin.app, bucketName)),
      detect: detectContentType,
      events: createLogFileEventPublisher(deps.logger),
      clock: systemClock,
      logger: deps.logger,
    });
    const handler = makeObjectFinalizedHandler({ finalizeUpload, logger: deps.logger });
    handlers.set(bucketName, handler);
    return handler;
  };
  return (event) => handlerFor(event.data.bucket)(event.data, { eventId: event.id });
};
