export type ContractDefinitionErrorCode = "INVALID_CONTRACT_META" | "DUPLICATE_CONTRACT_ID" | "MISSING_FIELD_META";

/** A contract declared wrong is a bug: it fails at import time, never at request time. */
export class ContractDefinitionError extends Error {
  readonly code: ContractDefinitionErrorCode;
  readonly contractId: string;
  readonly fields: readonly string[];

  constructor(
    args: { code: ContractDefinitionErrorCode; contractId: string; message: string; fields?: readonly string[] },
    options?: ErrorOptions,
  ) {
    super(args.message, options);
    this.name = "ContractDefinitionError";
    this.code = args.code;
    this.contractId = args.contractId;
    this.fields = args.fields ?? [];
  }
}
