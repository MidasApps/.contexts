import {
  createFirebaseAdmin,
  createFirestoreApprovalRequestRepository,
  createLogger,
  type WorkflowApprovalSettler,
} from "@core/services";
import { describe, expect, it } from "vitest";
import { makeOnApprovalRequestSettled } from "./on-approval-request-settled.ts";

// Runs inside `firebase emulators:exec` (root `pnpm test:emulators`). The handler reads real
// Firestore snapshots of `approval-requests` written by SP1's repository; the settler records
// what the Mastra settle route would receive. (The Functions emulator worker cannot reach a
// fake Mastra without project env plumbing, so the trigger wiring itself is not exercised here.)
const PROJECT_ID = process.env["GCLOUD_PROJECT"] ?? "demo-core";
const TENANT = "OrgFunctionsHitl0001";

const firebase = createFirebaseAdmin({
  env: { APP_ENV: "local", FIREBASE_PROJECT_ID: PROJECT_ID },
  processEnv: process.env,
});
const repository = createFirestoreApprovalRequestRepository({ firestore: firebase.firestore });
type StoredRequest = Parameters<typeof repository.create>[1]["request"];
type StatusChange = Parameters<typeof repository.setStatus>[1];
type ApprovalStatus = StatusChange["status"];

const logger = createLogger({ context: { service: "functions-test", env: "local" }, sink: () => undefined });

const recordingSettler = () => {
  const calls: string[] = [];
  const settler: WorkflowApprovalSettler = {
    settle: ({ approvalRequestId }) => {
      calls.push(approvalRequestId);
      return Promise.resolve({ ok: true, data: { settled: true, runStatus: "success" } });
    },
  };
  return { settler, calls };
};

// The functions codebase has no @core/contracts dependency; the literal mirrors the SP1 contract.
const createPending = async (kind: string): Promise<StoredRequest> => {
  const request = {
    id: repository.newId(),
    tenantId: TENANT,
    node: { level: "organization", tenantId: TENANT },
    permission: "core.workflow-run.approve-demo",
    requestedBy: { type: "user", id: "member-uid" },
    action: {
      kind,
      input: { workflowId: "approval-demo", runId: "run-1", stepId: "request-human-approval" },
      summary: "Create the note",
    },
    status: "pending",
    decidedBy: null,
    reason: null,
    expiresAt: "2026-10-07T12:00:00.000Z",
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  } as unknown as StoredRequest;
  await firebase.firestore.runTransaction((tx) =>
    Promise.resolve(repository.create(tx, { request, actorId: "member-uid" })),
  );
  return request;
};

// Moves the stored request like SP1 does and hands the handler the real before/after snapshots.
const settleTo = async (request: StoredRequest, status: ApprovalStatus) => {
  const ref = firebase.firestore.collection("approval-requests").doc(request.id);
  const before = await ref.get();
  await firebase.firestore.runTransaction((tx) =>
    Promise.resolve(
      repository.setStatus(tx, {
        id: request.id,
        status,
        ...(status === "expired" ? {} : { decidedBy: "admin-uid" as NonNullable<StatusChange["decidedBy"]> }),
        updatedAt: "2026-09-30T12:05:00.000Z",
        actorId: "admin-uid",
      }),
    ),
  );
  const after = await ref.get();
  return { id: `evt-${request.id}-${status}`, params: { id: request.id }, data: { before, after } };
};

describe("onApprovalRequestSettled on the Firestore emulator (decision 0036)", () => {
  it("settles a rejected workflow-resume request through the gateway", async () => {
    const { settler, calls } = recordingSettler();
    const handler = makeOnApprovalRequestSettled({ env: { APP_ENV: "local" }, logger, settler });
    const request = await createPending("workflow-resume");
    expect(await handler(await settleTo(request, "rejected"))).toBe("settled");
    expect(calls).toEqual([request.id]);
  });

  it("ignores an approval (the SP1 handler resumes it) and other kinds", async () => {
    const { settler, calls } = recordingSettler();
    const handler = makeOnApprovalRequestSettled({ env: { APP_ENV: "local" }, logger, settler });
    expect(await handler(await settleTo(await createPending("workflow-resume"), "approved"))).toBe("ignored");
    expect(await handler(await settleTo(await createPending("agent-command"), "rejected"))).toBe("ignored");
    expect(calls).toEqual([]);
  });

  it("settles expired and cancelled requests too", async () => {
    const { settler, calls } = recordingSettler();
    const handler = makeOnApprovalRequestSettled({ env: { APP_ENV: "local" }, logger, settler });
    const expired = await createPending("workflow-resume");
    const cancelled = await createPending("workflow-resume");
    expect(await handler(await settleTo(expired, "expired"))).toBe("settled");
    expect(await handler(await settleTo(cancelled, "cancelled"))).toBe("settled");
    expect(calls).toEqual([expired.id, cancelled.id]);
  });
});
