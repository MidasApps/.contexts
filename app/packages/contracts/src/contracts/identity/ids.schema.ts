import type { z } from "zod";
import { firestoreIdSchema } from "../primitives/ids.schema.ts";

/** Automatic id of `devices/{id}`; also the Firebase Auth uid the device signs in with. */
export const DeviceIdSchema = firestoreIdSchema<"DeviceId">();
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const DeviceActivationIdSchema = firestoreIdSchema<"DeviceActivationId">();
export type DeviceActivationId = z.infer<typeof DeviceActivationIdSchema>;

export const ApiKeyIdSchema = firestoreIdSchema<"ApiKeyId">();
export type ApiKeyId = z.infer<typeof ApiKeyIdSchema>;

/** Id of a `sessions` record (web cookie or desktop session). */
export const SessionIdSchema = firestoreIdSchema<"SessionId">();
export type SessionId = z.infer<typeof SessionIdSchema>;

export const ImpersonationSessionIdSchema = firestoreIdSchema<"ImpersonationSessionId">();
export type ImpersonationSessionId = z.infer<typeof ImpersonationSessionIdSchema>;
