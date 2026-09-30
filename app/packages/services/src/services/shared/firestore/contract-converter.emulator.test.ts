import { defineContract, firestoreIdSchema, IsoDateTimeSchema, TenantIdSchema } from "@core/contracts";
import { type DocumentData, FieldValue, Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createFirebaseAdmin } from "../firebase/firebase-admin.ts";
import { createContractConverter, toFirestoreUpdate } from "./contract-converter.ts";
import { CorruptDocumentError } from "./corrupt-document-error.ts";

// Runs inside `firebase emulators:exec`, which exports FIRESTORE_EMULATOR_HOST.
const { firestore } = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: "demo-core" },
  processEnv: process.env,
});

const COLLECTION = "contract-converter-test-docs";
const meta = (description: string, pii: "none" | "personal" = "none") => ({ description, pii });

const SampleSchema = z.object({
  id: firestoreIdSchema<"SampleId">().meta(meta("Automatic id.")),
  tenantId: TenantIdSchema.meta(meta("Owning organization.")),
  name: z.string().min(1).meta(meta("Display name.", "personal")),
  occurredAt: IsoDateTimeSchema.meta(meta("When it happened.")),
  window: z
    .object({
      endsAt: IsoDateTimeSchema.optional().meta(meta("End of the window.")),
      label: z.string().meta(meta("Window label.")),
    })
    .meta(meta("Validity window.")),
  checkpoints: z.array(IsoDateTimeSchema.meta(meta("One checkpoint."))).meta(meta("Checkpoints.")),
  deletedAt: IsoDateTimeSchema.nullable().meta(meta("Soft delete time.")),
});

const SampleContract = defineContract(SampleSchema, {
  id: "test.Sample",
  kind: "entity",
  description: "Converter test entity.",
  examples: [
    {
      id: "Xk2mQ9vLr3TnB7pWc1aZ",
      tenantId: "Jd8sK2lPq0WnR5tYu3bV",
      name: "Sample",
      occurredAt: "2026-09-29T14:30:00.000Z",
      window: { label: "launch" },
      checkpoints: [],
      deletedAt: null,
    },
  ],
  pii: "personal",
  tenancyScope: "organization",
  relations: [],
  permission: "test.sample.read",
});

// Raw Firestore data is untyped; walk it without trusting its shape.
const readPath = (data: DocumentData, ...path: string[]): unknown =>
  path.reduce<unknown>((value, key) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined), data);

const captureError = (fn: () => unknown): unknown => {
  try {
    fn();
    return undefined;
  } catch (error: unknown) {
    return error;
  }
};

const collection = () => firestore.collection(COLLECTION);
const converted = () => collection().withConverter(createContractConverter(SampleContract));

const SAMPLE = {
  tenantId: "tenant-1",
  name: "Sample",
  occurredAt: "2026-09-29T14:30:00.123Z",
  window: { endsAt: "2026-10-01T00:00:00.000Z", label: "launch" },
  checkpoints: ["2026-09-29T15:00:00.000Z", "2026-09-29T16:00:00.000Z"],
  deletedAt: null,
};

beforeEach(async () => {
  await firestore.recursiveDelete(collection());
});

describe("createContractConverter", () => {
  it("stores ISO date-time fields as Timestamps and drops the id field", async () => {
    const ref = converted().doc();
    await ref.set(SampleSchema.parse({ ...SAMPLE, id: ref.id }));

    const raw = (await collection().doc(ref.id).get()).data() ?? {};
    expect(Object.keys(raw)).not.toContain("id");
    expect(readPath(raw, "occurredAt")).toBeInstanceOf(Timestamp);
    expect(readPath(raw, "window", "endsAt")).toBeInstanceOf(Timestamp);
    expect(readPath(raw, "checkpoints", "1")).toBeInstanceOf(Timestamp);
    expect(raw).toMatchObject({ deletedAt: null, name: "Sample", window: { label: "launch" } });
  });

  it("reads Timestamps back as the same ISO strings with the document id", async () => {
    const ref = converted().doc();
    await ref.set(SampleSchema.parse({ ...SAMPLE, id: ref.id }));

    const snapshot = await ref.get();
    expect(snapshot.data()).toEqual({ ...SAMPLE, id: ref.id });
  });

  it("keeps an absent optional date-time absent", async () => {
    const ref = converted().doc();
    await ref.set(SampleSchema.parse({ ...SAMPLE, id: ref.id, window: { label: "open" } }));

    expect((await ref.get()).data()?.window).toEqual({ label: "open" });
  });

  it("fails a corrupt read with the document path and issue paths, never the values", async () => {
    const ref = collection().doc();
    await ref.set({ ...SAMPLE, name: 987654321, occurredAt: "ana@example.com" });

    // The converter runs when the snapshot's data is read, not on get().
    const snapshot = await converted().doc(ref.id).get();
    const error = captureError(() => snapshot.data());
    if (!(error instanceof CorruptDocumentError)) throw new Error("expected CorruptDocumentError");
    expect(error.code).toBe("CORRUPT_DOCUMENT");
    expect(error.documentPath).toBe(`${COLLECTION}/${ref.id}`);
    expect(error.issuePaths).toEqual(["name", "occurredAt"]);
    expect(error.message).not.toMatch(/ana@example\.com|987654321/);
  });
});

describe("toFirestoreUpdate", () => {
  it("stores ISO date-times of an update() patch as Timestamps, by field or dotted path", async () => {
    const ref = converted().doc();
    await ref.set(SampleSchema.parse({ ...SAMPLE, id: ref.id }));

    await collection()
      .doc(ref.id)
      .update(
        toFirestoreUpdate(SampleContract, {
          name: "Renamed",
          occurredAt: "2026-10-02T10:00:00.000Z",
          "window.endsAt": "2026-10-03T00:00:00.000Z",
          checkpoints: ["2026-10-04T00:00:00.000Z"],
          deletedAt: FieldValue.serverTimestamp(),
        }),
      );

    const raw = (await collection().doc(ref.id).get()).data() ?? {};
    expect(readPath(raw, "occurredAt")).toBeInstanceOf(Timestamp);
    expect(readPath(raw, "window", "endsAt")).toBeInstanceOf(Timestamp);
    expect(readPath(raw, "checkpoints", "0")).toBeInstanceOf(Timestamp);
    expect(readPath(raw, "deletedAt")).toBeInstanceOf(Timestamp);
    expect((await ref.get()).data()).toMatchObject({
      name: "Renamed",
      occurredAt: "2026-10-02T10:00:00.000Z",
      window: { endsAt: "2026-10-03T00:00:00.000Z", label: "launch" },
      checkpoints: ["2026-10-04T00:00:00.000Z"],
    });
  });

  it("converts date-times nested in an object value and leaves other keys untouched", () => {
    const patch = toFirestoreUpdate(SampleContract, { window: { endsAt: "2026-10-03T00:00:00.000Z", label: "x" }, name: "2026-10-03T00:00:00.000Z" });
    expect(readPath(patch, "window", "endsAt")).toBeInstanceOf(Timestamp);
    expect(patch["name"]).toBe("2026-10-03T00:00:00.000Z");
  });
});
