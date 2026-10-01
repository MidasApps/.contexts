import { ApprovalDiffPropsSchema, ApprovalPendingPropsSchema, ChartPropsSchema, DataTablePropsSchema, PickerPropsSchema, SchemaFormPropsSchema } from "@core/contracts";
import { lazy } from "react";
import { uiEntry, type UiRegistryEntry } from "../model/ui-registry.ts";
import { ApprovalDiffPart } from "./components/approval-diff-part.tsx";
import { ApprovalPendingPart } from "./components/approval-pending-part.tsx";
import { DataTablePart } from "./components/data-table-part.tsx";
import { PickerPart } from "./components/picker-part.tsx";
import { SchemaFormPart } from "./components/schema-form-part.tsx";

// recharts is heavy and most conversations never draw a chart: its part loads on first use.
const LazyChartPart = lazy(async () => ({ default: (await import("./components/chart-part.tsx")).ChartPart }));

/**
 * The generative UI components of the core (SP4 spec §5.2), keyed like `CHAT_UI_COMPONENTS` of
 * `@core/contracts`: each entry pairs the props schema of the contract with its component, so
 * what the server promises and what the client accepts cannot drift apart.
 */
export const CORE_UI_COMPONENTS: Readonly<Record<string, UiRegistryEntry>> = {
  "schema-form": uiEntry({ schema: SchemaFormPropsSchema, Component: SchemaFormPart }),
  "data-table": uiEntry({ schema: DataTablePropsSchema, Component: DataTablePart }),
  chart: uiEntry({ schema: ChartPropsSchema, Component: LazyChartPart }),
  "approval-diff": uiEntry({ schema: ApprovalDiffPropsSchema, Component: ApprovalDiffPart }),
  picker: uiEntry({ schema: PickerPropsSchema, Component: PickerPart }),
  "approval-pending": uiEntry({ schema: ApprovalPendingPropsSchema, Component: ApprovalPendingPart }),
};
