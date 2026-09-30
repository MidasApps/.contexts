// Every identity contract, in catalog order; composition.ts registers them.
import type { ContractDefinition } from "../contract.ts";
import { SetActiveOrganizationInputContract } from "./active-organization-input.schema.ts";
import { ApiKeyContract, CreateApiKeyInputContract, CreateApiKeyResponseContract } from "./api-key.schema.ts";
import {
  CreateDesktopSessionResponseContract,
  ExchangeDesktopSessionInputContract,
  ExchangeDesktopSessionResponseContract,
} from "./desktop-session.schema.ts";
import { DeviceContract } from "./device.schema.ts";
import {
  ImpersonationSessionContract,
  StartImpersonationInputContract,
  StartImpersonationResponseContract,
} from "./impersonation-session.schema.ts";
import { MeContract } from "./me.schema.ts";
import { PlatformStaffContract } from "./platform-staff.schema.ts";
import { PrincipalContract } from "./principal.schema.ts";
import { SessionSummaryContract } from "./session.schema.ts";
import { UpdateMeInputContract } from "./update-me-input.schema.ts";
import { UserPreferencesContract } from "./user-preferences.schema.ts";
import { UserContract } from "./user.schema.ts";

export const IDENTITY_CONTRACTS: readonly ContractDefinition[] = [
  PrincipalContract,
  UserContract,
  UserPreferencesContract,
  MeContract,
  UpdateMeInputContract,
  SetActiveOrganizationInputContract,
  SessionSummaryContract,
  CreateDesktopSessionResponseContract,
  ExchangeDesktopSessionInputContract,
  ExchangeDesktopSessionResponseContract,
  DeviceContract,
  ApiKeyContract,
  CreateApiKeyInputContract,
  CreateApiKeyResponseContract,
  PlatformStaffContract,
  ImpersonationSessionContract,
  StartImpersonationInputContract,
  StartImpersonationResponseContract,
];
