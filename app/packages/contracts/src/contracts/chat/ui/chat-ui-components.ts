import type { ContractDefinition } from "../../contract.ts";
import { ApprovalDiffPropsContract } from "./approval-diff.schema.ts";
import { ApprovalPendingPropsContract } from "./approval-pending.schema.ts";
import { ChartPropsContract } from "./chart.schema.ts";
import { DataTablePropsContract } from "./data-table.schema.ts";
import { PickerPropsContract } from "./picker.schema.ts";
import { SchemaFormPropsContract } from "./schema-form.schema.ts";

/**
 * Generative UI registry of the core (decision 0032, D4-03): `ui.component` id → props
 * contract. The client validates props with the same schema; unknown ids fall back to the
 * generic tool view.
 */
export const CHAT_UI_COMPONENTS: Readonly<Record<string, ContractDefinition>> = {
  "schema-form": SchemaFormPropsContract,
  "data-table": DataTablePropsContract,
  chart: ChartPropsContract,
  "approval-diff": ApprovalDiffPropsContract,
  picker: PickerPropsContract,
  "approval-pending": ApprovalPendingPropsContract,
};

export const CHAT_UI_CONTRACTS: readonly ContractDefinition[] = Object.values(CHAT_UI_COMPONENTS);
