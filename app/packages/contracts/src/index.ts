// Public API of @core/contracts. Explicit named re-exports only (no `export *`).
export {
  ContractDefinitionError,
  type ContractDefinitionErrorCode,
} from "./contracts/contract-definition-error.ts";
export {
  isFieldOptional,
  listTopLevelFields,
  readFieldMeta,
  readRawFieldMeta,
  type ZodMetaRegistry,
} from "./contracts/field-meta.ts";
export { CORE_CONTRACTS, composeCoreContracts } from "./composition.ts";
export { defineContract, type ContractDefinition } from "./contracts/contract.ts";
export { inspectSchema, isPiiBelow, maxPii, type FieldMetaInspection, type FieldMetaProblem } from "./contracts/field-meta-rules.ts";
export { createContractRegistry, type ContractRegistry, type RegisteredContract } from "./contracts/registry.ts";
export {
  CatalogMetaSchema,
  ContractIdSchema,
  ContractKindSchema,
  CUSTOM_META_KEYS,
  FieldMetaSchema,
  PermissionSchema,
  PiiLevelSchema,
  RelationSchema,
  TenancyScopeSchema,
  UiMetaSchema,
  type CatalogMeta,
  type ContractId,
  type ContractKind,
  type FieldMeta,
  type Permission,
  type PiiLevel,
  type Relation,
  type TenancyScope,
  type UiMeta,
} from "./contracts/primitives/catalog-meta.schema.ts";
export {
  EventIdSchema,
  firestoreIdSchema,
  IdempotencyKeySchema,
  RequestIdSchema,
  TenantIdSchema,
  UserIdSchema,
  type EventId,
  type IdempotencyKey,
  type RequestId,
  type TenantId,
  type UserId,
} from "./contracts/primitives/ids.schema.ts";
export { IsoDateTimeSchema, type IsoDateTime } from "./contracts/primitives/iso-datetime.schema.ts";
export { LocaleSchema, type Locale } from "./contracts/primitives/locale.schema.ts";
export { CurrencySchema, MoneySchema, type Currency, type Money } from "./contracts/primitives/money.schema.ts";
export { TimeZoneSchema, type TimeZone } from "./contracts/primitives/time-zone.schema.ts";
// Removable sample contract (keeps the catalog non-empty).
export { NoteContract, NoteIdSchema, NoteSchema, type Note, type NoteId } from "./contracts/example/note.schema.ts";
