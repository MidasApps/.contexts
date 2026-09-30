import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { AccessReaders } from "../../application/ports/driven/access-readers.ts";
import type { AccessProjectionStore } from "../../application/ports/driven/access-projection-writer.ts";
import type { ClaimsWriter } from "../../application/ports/driven/claims-writer.ts";
import type { InvitationRepository } from "../../application/ports/driven/invitation-repository.ts";
import type { MembershipRepository } from "../../application/ports/driven/membership-repository.ts";
import type { OrganizationDirectory } from "../../application/ports/driven/organization-directory.ts";
import type { UserDirectory } from "../../application/ports/driven/user-directory.ts";
import type { RoleRepository } from "../../application/ports/driven/role-repository.ts";
import type { UserAccessVersionStore } from "../../application/ports/driven/user-access-version.ts";
import { createFirebaseClaimsWriter } from "./firebase-claims-writer.ts";
import { createFirebaseUserDirectory } from "./firebase-user-directory.ts";
import { createFirestoreInvitationRepository } from "./firestore-invitation-repository.ts";
import { createFirestoreOrganizationDirectory } from "./firestore-organization-directory.ts";
import { createFirestoreAccessProjectionStore } from "./firestore-access-projection-writer.ts";
import { createFirestoreGrantReader } from "./firestore-grant-reader.ts";
import { createFirestoreMembershipRepository } from "./firestore-membership-repository.ts";
import { createFirestoreNodeChainReader } from "./firestore-node-chain-reader.ts";
import { createFirestorePrincipalStatusReader } from "./firestore-principal-status-reader.ts";
import { createFirestoreRoleReader } from "./firestore-role-reader.ts";
import { createFirestoreRoleRepository } from "./firestore-role-repository.ts";
import { createFirestoreUserAccessVersionStore } from "./firestore-user-access-version.ts";

/** Every Firestore/Auth adapter of the access context, built once per process. */
export type FirestoreAccessAdapters = {
  readonly readers: AccessReaders;
  readonly memberships: MembershipRepository;
  readonly roles: RoleRepository;
  readonly projections: AccessProjectionStore;
  readonly users: UserAccessVersionStore;
  readonly claims: ClaimsWriter;
  readonly invitations: InvitationRepository;
  readonly directory: UserDirectory;
  readonly organizations: OrganizationDirectory;
};

/**
 * Builds the access adapters over Firestore and Firebase Auth. Adapters keep references
 * only; nothing is read until a use case runs.
 */
export const createFirestoreAccessAdapters = (deps: { firestore: Firestore; auth: Auth }): FirestoreAccessAdapters => {
  const { firestore } = deps;
  return {
    readers: {
      grants: createFirestoreGrantReader({ firestore }),
      roles: createFirestoreRoleReader({ firestore }),
      nodeChains: createFirestoreNodeChainReader({ firestore }),
      principals: createFirestorePrincipalStatusReader({ firestore }),
    },
    memberships: createFirestoreMembershipRepository({ firestore }),
    roles: createFirestoreRoleRepository({ firestore }),
    projections: createFirestoreAccessProjectionStore({ firestore }),
    users: createFirestoreUserAccessVersionStore({ firestore }),
    claims: createFirebaseClaimsWriter({ auth: deps.auth }),
    invitations: createFirestoreInvitationRepository({ firestore }),
    directory: createFirebaseUserDirectory({ firestore, auth: deps.auth }),
    organizations: createFirestoreOrganizationDirectory({ firestore }),
  };
};
