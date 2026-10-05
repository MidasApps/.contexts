// Every audit contract, in catalog order; composition.ts registers them.
import type { ContractDefinition } from "../contract.ts";
import { AuditLogEntryContract, PlatformAuditLogEntryContract } from "./audit-log-entry.schema.ts";
import { AuditLogQueryContract, PlatformAuditLogQueryContract } from "./audit-log-query.schema.ts";

export const AUDIT_CONTRACTS: readonly ContractDefinition[] = [
  AuditLogEntryContract,
  PlatformAuditLogEntryContract,
  AuditLogQueryContract,
  PlatformAuditLogQueryContract,
];
