import { TenantIdSchema, UserIdSchema } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { emulatorFirebase } from "../../../shared/testing/core-server-emulator.fixture.ts";
import { feedbackKeyOf } from "../../application/use-cases/record-message-feedback.ts";
import { createFirestoreMessageFeedbackStore, MESSAGE_FEEDBACK_COLLECTION } from "./firestore-message-feedback-store.ts";

const firebase = emulatorFirebase();
const RUN = Date.now().toString(36);

describe("Firestore message feedback store (emulator)", () => {
  it("keeps one document per message and user, replacing the rating and keeping createdAt", async () => {
    const store = createFirestoreMessageFeedbackStore({ firestore: firebase.firestore });
    const tenantId = TenantIdSchema.parse(`Tenant${RUN}`);
    const userId = UserIdSchema.parse(`user${RUN}`);
    const key = feedbackKeyOf({ tenantId, conversationId: `c${RUN}`, messageId: "m1", userId });
    const base = { conversationId: `c${RUN}`, tenantId, userId, messageId: "m1" };
    await store.upsert({ key, feedback: { ...base, rating: "up" }, at: "2026-10-01T12:00:00.000Z" });
    const second = await store.upsert({ key, feedback: { ...base, rating: "down", comment: "Wrong." }, at: "2026-10-01T13:00:00.000Z" });
    expect(second).toMatchObject({ rating: "down", comment: "Wrong.", createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T13:00:00.000Z" });
    const docs = await firebase.firestore.collection(MESSAGE_FEEDBACK_COLLECTION).where("conversationId", "==", `c${RUN}`).get();
    expect(docs.size).toBe(1);
    expect(docs.docs[0]?.id).toBe(key);
  });
});
