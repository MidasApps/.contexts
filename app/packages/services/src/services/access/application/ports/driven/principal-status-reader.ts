import type {
  ApiKeyStatus,
  DeviceStatus,
  ImpersonationSessionId,
  PlatformRole,
  TenantId,
  TenantNodeRef,
  UserId,
  UserStatus,
} from "@core/contracts";

export type UserStatusRecord = { readonly status: UserStatus };

export type DeviceStatusRecord = { readonly tenantId: TenantId; readonly status: DeviceStatus };

export type ApiKeyStatusRecord = {
  readonly tenantId: TenantId;
  readonly ownerUid: UserId;
  readonly status: ApiKeyStatus;
  /** ISO 8601 UTC. */
  readonly expiresAt: string;
  readonly scopes: readonly string[];
  readonly node: TenantNodeRef;
};

export type PlatformStaffRecord = { readonly role: PlatformRole; readonly isActive: boolean };

export type ImpersonationSessionRecord = {
  readonly staffUid: UserId;
  readonly targetUid: UserId;
  readonly tenantId: TenantId;
  /** ISO 8601 UTC. */
  readonly expiresAt: string;
  /** ISO 8601 UTC, or null while open. */
  readonly endedAt: string | null;
};

/**
 * Current status of every kind of principal, read from the source documents
 * (`users`, `devices`, `api-keys`, `platform-staff`, `impersonation-sessions`).
 * Each getter returns null when the document does not exist.
 */
export type PrincipalStatusReader = {
  readonly getUser: (uid: UserId) => Promise<UserStatusRecord | null>;
  readonly getDevice: (deviceId: string) => Promise<DeviceStatusRecord | null>;
  readonly getApiKey: (apiKeyId: string) => Promise<ApiKeyStatusRecord | null>;
  readonly getPlatformStaff: (uid: UserId) => Promise<PlatformStaffRecord | null>;
  readonly getImpersonationSession: (sessionId: ImpersonationSessionId) => Promise<ImpersonationSessionRecord | null>;
};
