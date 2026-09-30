import type { Firestore } from "firebase-admin/firestore";
import type { OrganizationRepository } from "../../application/ports/driven/organization-repository.ts";
import type { ProjectRepository } from "../../application/ports/driven/project-repository.ts";
import type { UnitRepository } from "../../application/ports/driven/unit-repository.ts";
import { createFirestoreOrganizationRepository } from "./firestore-organization-repository.ts";
import { createFirestoreProjectRepository } from "./firestore-project-repository.ts";
import { createFirestoreUnitRepository } from "./firestore-unit-repository.ts";

export type FirestoreTenancyAdapters = {
  readonly organizations: OrganizationRepository;
  readonly projects: ProjectRepository;
  readonly units: UnitRepository;
};

/** The tenancy repositories over Firestore; references only, nothing is read at build. */
export const createFirestoreTenancyAdapters = (deps: { firestore: Firestore }): FirestoreTenancyAdapters => ({
  organizations: createFirestoreOrganizationRepository(deps),
  projects: createFirestoreProjectRepository(deps),
  units: createFirestoreUnitRepository(deps),
});
