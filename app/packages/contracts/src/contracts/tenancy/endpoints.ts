// Tenancy `/v1` descriptors (SP1 spec §7.3: organizations, projects, units, unit types).
import { z } from "zod";
import { none } from "../field-docs.ts";
import { defineEndpoint, type EndpointDefinition } from "../http/endpoint.ts";
import { dataEnvelope, listEnvelope, PageQuerySchema } from "../http/envelopes.schema.ts";
import { CreateOrganizationInputSchema } from "./create-organization-input.schema.ts";
import { CreateProjectInputSchema } from "./create-project-input.schema.ts";
import { CreateUnitInputSchema } from "./create-unit-input.schema.ts";
import { OrganizationIdSchema, ProjectIdSchema, UnitIdSchema } from "./ids.schema.ts";
import { OrganizationSchema } from "./organization.schema.ts";
import { ProjectSchema } from "./project.schema.ts";
import { UnitTypeDefinitionSchema } from "./unit-type.schema.ts";
import { UnitSchema } from "./unit.schema.ts";
import { UpdateOrganizationInputSchema } from "./update-organization-input.schema.ts";
import { UpdateProjectInputSchema } from "./update-project-input.schema.ts";
import { UpdateUnitInputSchema } from "./update-unit-input.schema.ts";

/** `{organizationId}` path param, shared by every organization-scoped route. */
export const OrganizationParamsSchema = z.object({ organizationId: OrganizationIdSchema.meta(none("Organization id.")) });
const projectParams = z.object({ projectId: ProjectIdSchema.meta(none("Project id.")) });
const unitParams = z.object({ unitId: UnitIdSchema.meta(none("Unit id.")) });

const NOT_FOUND = ["NOT_FOUND"] as const;
const FORBIDDEN = ["FORBIDDEN"] as const;

export const createOrganizationEndpoint = defineEndpoint({
  id: "tenancy.createOrganization",
  method: "POST",
  path: "/v1/organizations",
  auth: "user",
  body: CreateOrganizationInputSchema,
  responses: { 201: dataEnvelope(OrganizationSchema) },
  errors: { 403: FORBIDDEN },
  idempotency: "optional",
  summary: "Creates an organization with the caller as owner (self-serve flag).",
});

export const getOrganizationEndpoint = defineEndpoint({
  id: "tenancy.getOrganization",
  method: "GET",
  path: "/v1/organizations/{organizationId}",
  auth: "principal",
  params: OrganizationParamsSchema,
  responses: { 200: dataEnvelope(OrganizationSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Reads an organization (core.organization.read).",
});

export const updateOrganizationEndpoint = defineEndpoint({
  id: "tenancy.updateOrganization",
  method: "PATCH",
  path: "/v1/organizations/{organizationId}",
  auth: "principal",
  params: OrganizationParamsSchema,
  body: UpdateOrganizationInputSchema,
  responses: { 200: dataEnvelope(OrganizationSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Changes an organization (core.organization.update).",
});

export const deleteOrganizationEndpoint = defineEndpoint({
  id: "tenancy.deleteOrganization",
  method: "DELETE",
  path: "/v1/organizations/{organizationId}",
  auth: "user",
  params: OrganizationParamsSchema,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Soft-deletes an organization and revokes every access projection (core.organization.delete).",
});

export const listProjectsEndpoint = defineEndpoint({
  id: "tenancy.listProjects",
  method: "GET",
  path: "/v1/organizations/{organizationId}/projects",
  auth: "principal",
  params: OrganizationParamsSchema,
  query: PageQuerySchema,
  responses: { 200: listEnvelope(ProjectSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the projects of an organization the caller can see (core.project.read).",
});

export const createProjectEndpoint = defineEndpoint({
  id: "tenancy.createProject",
  method: "POST",
  path: "/v1/organizations/{organizationId}/projects",
  auth: "principal",
  params: OrganizationParamsSchema,
  body: CreateProjectInputSchema,
  responses: { 201: dataEnvelope(ProjectSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  idempotency: "optional",
  summary: "Creates a project (core.project.create at the organization).",
});

export const getProjectEndpoint = defineEndpoint({
  id: "tenancy.getProject",
  method: "GET",
  path: "/v1/projects/{projectId}",
  auth: "principal",
  params: projectParams,
  responses: { 200: dataEnvelope(ProjectSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Reads a project (core.project.read).",
});

export const updateProjectEndpoint = defineEndpoint({
  id: "tenancy.updateProject",
  method: "PATCH",
  path: "/v1/projects/{projectId}",
  auth: "principal",
  params: projectParams,
  body: UpdateProjectInputSchema,
  responses: { 200: dataEnvelope(ProjectSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Changes a project (core.project.update).",
});

export const deleteProjectEndpoint = defineEndpoint({
  id: "tenancy.deleteProject",
  method: "DELETE",
  path: "/v1/projects/{projectId}",
  auth: "principal",
  params: projectParams,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND },
  summary: "Soft-deletes a project (core.project.delete).",
});

export const listUnitsEndpoint = defineEndpoint({
  id: "tenancy.listUnits",
  method: "GET",
  path: "/v1/projects/{projectId}/units",
  auth: "principal",
  params: projectParams,
  query: PageQuerySchema.extend({
    parentUnitId: UnitIdSchema.optional().meta(none("Children of this unit; absent lists the units directly under the project.")),
  }),
  responses: { 200: listEnvelope(UnitSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Lists the child units of a project or unit the caller can see (core.unit.read).",
});

export const createUnitEndpoint = defineEndpoint({
  id: "tenancy.createUnit",
  method: "POST",
  path: "/v1/projects/{projectId}/units",
  auth: "principal",
  params: projectParams,
  body: CreateUnitInputSchema,
  responses: { 201: dataEnvelope(UnitSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND, 409: ["CONFLICT"], 422: ["INVALID_UNIT_PARENT"] },
  idempotency: "optional",
  summary: "Creates a unit under the project or a unit (core.unit.create at the parent); 409 while the tree is being changed.",
});

export const getUnitEndpoint = defineEndpoint({
  id: "tenancy.getUnit",
  method: "GET",
  path: "/v1/units/{unitId}",
  auth: "principal",
  params: unitParams,
  responses: { 200: dataEnvelope(UnitSchema) },
  errors: { 404: NOT_FOUND },
  summary: "Reads a unit (core.unit.read).",
});

export const updateUnitEndpoint = defineEndpoint({
  id: "tenancy.updateUnit",
  method: "PATCH",
  path: "/v1/units/{unitId}",
  auth: "principal",
  params: unitParams,
  body: UpdateUnitInputSchema,
  responses: { 200: dataEnvelope(UnitSchema) },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND, 409: ["CONFLICT"], 422: ["INVALID_UNIT_PARENT", "SUBTREE_TOO_LARGE"] },
  summary: "Renames or moves a unit inside its project (core.unit.update); moves are serialized per project (409).",
});

export const deleteUnitEndpoint = defineEndpoint({
  id: "tenancy.deleteUnit",
  method: "DELETE",
  path: "/v1/units/{unitId}",
  auth: "principal",
  params: unitParams,
  responses: { 204: null },
  errors: { 403: FORBIDDEN, 404: NOT_FOUND, 409: ["CONFLICT"], 422: ["SUBTREE_TOO_LARGE"] },
  summary: "Soft-deletes a unit and its subtree (core.unit.delete); serialized with moves per project (409).",
});

export const listUnitTypesEndpoint = defineEndpoint({
  id: "tenancy.listUnitTypes",
  method: "GET",
  path: "/v1/unit-types",
  auth: "user",
  query: PageQuerySchema,
  responses: { 200: listEnvelope(UnitTypeDefinitionSchema) },
  summary: "Lists the unit types registered by the application modules.",
});

export const TENANCY_ENDPOINTS: readonly EndpointDefinition[] = [
  createOrganizationEndpoint,
  getOrganizationEndpoint,
  updateOrganizationEndpoint,
  deleteOrganizationEndpoint,
  listProjectsEndpoint,
  createProjectEndpoint,
  getProjectEndpoint,
  updateProjectEndpoint,
  deleteProjectEndpoint,
  listUnitsEndpoint,
  createUnitEndpoint,
  getUnitEndpoint,
  updateUnitEndpoint,
  deleteUnitEndpoint,
  listUnitTypesEndpoint,
];
