import type { TenantId, UserId } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";

/** What access writes need from `users/{uid}`. */
export type UserAccessState = { readonly accessVersion: number; readonly activeOrganizationId: TenantId | null };

/** Profile a new `users/{uid}` doc starts with (read from Firebase Auth). */
export type NewUserProfile = { readonly email: string; readonly displayName: string; readonly photoUrl?: string };

/**
 * `users.accessVersion` and the active organization (SP1 spec §5.4): every grant change
 * bumps the version in its transaction; `createOrganization` creates the doc when missing
 * (`authorize()` treats a user without it as inactive).
 */
export type UserAccessVersionStore = {
  readonly read: (tx: Transaction | undefined, uid: UserId) => Promise<UserAccessState | null>;
  /** `accessVersion + 1`; also sets `lastContext.organizationId` when `activeOrganizationId` is given. */
  readonly bump: (
    tx: Transaction,
    args: {
      uid: UserId;
      current: UserAccessState;
      activeOrganizationId?: TenantId;
      updatedAt: string;
      actorId: string;
    },
  ) => void;
  readonly create: (
    tx: Transaction,
    args: {
      uid: UserId;
      profile: NewUserProfile;
      accessVersion: number;
      activeOrganizationId: TenantId;
      createdAt: string;
    },
  ) => void;
};
