import type { ConsoleGateway } from "#/services/observability/application/ports/console-gateway.ts";

type DatasetItemsGateway = Pick<
  ConsoleGateway,
  "listDatasetItems" | "addDatasetItem" | "deleteDatasetItem" | "createDataset" | "renameDataset" | "deleteDataset"
>;

export type ListDatasetItems = ConsoleGateway["listDatasetItems"];
export type AddDatasetItem = ConsoleGateway["addDatasetItem"];
export type DeleteDatasetItem = ConsoleGateway["deleteDatasetItem"];
export type CreateDataset = ConsoleGateway["createDataset"];
export type RenameDataset = ConsoleGateway["renameDataset"];
export type DeleteDataset = ConsoleGateway["deleteDataset"];

/**
 * An organization's dataset items and datasets (follow-up 66, decision 0062). `/v1` authorizes
 * and fixes the tenant; the runtime reads the dataset under that tenant, so another tenant's or a
 * platform dataset answers `NOT_FOUND`. Items are plain text: the input an agent receives and the
 * expected answer.
 */
export const makeDatasetItemUseCases = (deps: { readonly console: DatasetItemsGateway }) => ({
  listDatasetItems: ((query) => deps.console.listDatasetItems(query)) satisfies ListDatasetItems,
  addDatasetItem: ((input) => deps.console.addDatasetItem(input)) satisfies AddDatasetItem,
  deleteDatasetItem: ((input) => deps.console.deleteDatasetItem(input)) satisfies DeleteDatasetItem,
  createDataset: ((input) => deps.console.createDataset(input)) satisfies CreateDataset,
  renameDataset: ((input) => deps.console.renameDataset(input)) satisfies RenameDataset,
  deleteDataset: ((input) => deps.console.deleteDataset(input)) satisfies DeleteDataset,
});
