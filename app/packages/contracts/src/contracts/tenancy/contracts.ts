// Every tenancy contract, in catalog order; composition.ts registers them.
import type { ContractDefinition } from "../contract.ts";
import { CreateOrganizationInputContract } from "./create-organization-input.schema.ts";
import { CreateProjectInputContract } from "./create-project-input.schema.ts";
import { CreateUnitInputContract } from "./create-unit-input.schema.ts";
import { NodeRefContract, TenantNodeRefContract } from "./node-ref.schema.ts";
import { OrganizationContract } from "./organization.schema.ts";
import { ProjectContract } from "./project.schema.ts";
import { RegionalSettingsContract } from "./regional-settings.schema.ts";
import { UnitTypeDefinitionContract } from "./unit-type.schema.ts";
import { UnitContract } from "./unit.schema.ts";
import { UpdateOrganizationInputContract } from "./update-organization-input.schema.ts";
import { UpdateProjectInputContract } from "./update-project-input.schema.ts";
import { UpdateUnitInputContract } from "./update-unit-input.schema.ts";

export const TENANCY_CONTRACTS: readonly ContractDefinition[] = [
  OrganizationContract,
  ProjectContract,
  UnitContract,
  UnitTypeDefinitionContract,
  NodeRefContract,
  TenantNodeRefContract,
  RegionalSettingsContract,
  CreateOrganizationInputContract,
  UpdateOrganizationInputContract,
  CreateProjectInputContract,
  UpdateProjectInputContract,
  CreateUnitInputContract,
  UpdateUnitInputContract,
];
