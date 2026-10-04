import type { z } from "zod";
import { firestoreIdSchema, type TenantId, TenantIdSchema } from "../primitives/ids.schema.ts";

/** An organization is the tenant (decision 0006 §1): its id is the tenant id. */
export const OrganizationIdSchema = TenantIdSchema;
export type OrganizationId = TenantId;

export const ProjectIdSchema = firestoreIdSchema<"ProjectId">();
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const UnitIdSchema = firestoreIdSchema<"UnitId">();
export type UnitId = z.infer<typeof UnitIdSchema>;
