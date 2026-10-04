import type { Principal, StoredFile, TenantId } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";

export const FILE_UPLOAD_PERMISSION = "core.file.upload";
export const KNOWLEDGE_READ_PERMISSION = "core.knowledge.read";

/** Who a file record names as uploader: the user, the device, or the API key's owner. */
export const uploaderIdOf = (principal: Principal): string =>
  principal.type === "user" ? principal.uid : principal.type === "device" ? principal.deviceId : principal.ownerUid;

/** What every files command carries: the verified caller and its request-scoped `authorize`. */
export type FilesCaller = { readonly principal: Principal; readonly authorize: Authorize };

const allows = async (caller: FilesCaller, permission: string, tenantId: TenantId): Promise<boolean> =>
  (await caller.authorize({ principal: caller.principal, permission, node: { level: "organization", tenantId } }))
    .allowed;

/**
 * Read access to a file record (SP3 Task 13): its uploader while they may still
 * upload in the organization, or any `core.knowledge.read` holder for a
 * knowledge file. Chat attachments stay private to their uploader until SP4
 * shares them through a conversation.
 */
export const canReadFile = async (caller: FilesCaller, file: StoredFile): Promise<boolean> => {
  if (
    file.createdBy === uploaderIdOf(caller.principal) &&
    (await allows(caller, FILE_UPLOAD_PERMISSION, file.tenantId))
  )
    return true;
  return file.purpose === "knowledge" && (await allows(caller, KNOWLEDGE_READ_PERMISSION, file.tenantId));
};

/** Whether the caller may upload in the organization. */
export const canUpload = (caller: FilesCaller, tenantId: TenantId): Promise<boolean> =>
  allows(caller, FILE_UPLOAD_PERMISSION, tenantId);
