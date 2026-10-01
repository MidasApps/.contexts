import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import type { GenerativeUiView } from "#/entities/message/index.ts";

/** What every generative component receives (decision 0032, D4-03). */
export type GenerativeComponentProps<Props> = {
  /** Props of the tool output, already validated with the component's contract schema. */
  readonly props: Props;
  /** The tool call that asked for the component. */
  readonly toolCallId: string;
  readonly toolName: string;
  /** The member may still answer: this is the latest turn and no answer is on its way. */
  readonly interactive: boolean;
  /** The generic view of the tool call, for a component that cannot render after all. */
  readonly fallback: ReactNode;
};

/** A registry entry: the props contract and the component that renders them. */
export type UiRegistryEntry<Props = unknown> = {
  readonly schema: z.ZodType<Props>;
  readonly Component: ComponentType<GenerativeComponentProps<Props>>;
};

/** Component id (`ui.component` of a tool output) → entry. */
export type UiRegistry = ReadonlyMap<string, UiRegistryEntry>;

/** Two entries share an id: a composition bug, raised when the registry is built. */
export class UiRegistryError extends Error {
  readonly code = "DUPLICATE_UI_COMPONENT";
  readonly componentId: string;
  constructor(componentId: string) {
    super(`DUPLICATE_UI_COMPONENT: ${componentId}`);
    this.name = "UiRegistryError";
    this.componentId = componentId;
  }
}

/** Widens a typed entry for the registry map; the schema guards the props at render time. */
export const uiEntry = <Props>(entry: UiRegistryEntry<Props>): UiRegistryEntry => entry as unknown as UiRegistryEntry;

/**
 * Builds a registry from groups of entries (the core components, then module components).
 * @throws {UiRegistryError} when an id appears twice — a module cannot replace a core component.
 */
export const createUiRegistry = (...groups: readonly Readonly<Record<string, UiRegistryEntry>>[]): UiRegistry => {
  const registry = new Map<string, UiRegistryEntry>();
  for (const [id, entry] of groups.flatMap((group) => Object.entries(group))) {
    if (registry.has(id)) throw new UiRegistryError(id);
    registry.set(id, entry);
  }
  return registry;
};

export type UiResolution =
  | { readonly ok: true; readonly entry: UiRegistryEntry; readonly props: unknown }
  | { readonly ok: false; readonly reason: "unknown-component" | "invalid-props" };

/**
 * Finds the component a tool output asks for and validates its props with the same schema the
 * server contract uses. Never throws: model output is untrusted, so anything unexpected is a
 * reason to show the generic tool view instead.
 */
export const resolveGenerativeUi = (registry: UiRegistry, ui: GenerativeUiView): UiResolution => {
  const entry = registry.get(ui.component);
  if (entry === undefined) return { ok: false, reason: "unknown-component" };
  const parsed = entry.schema.safeParse(ui.props);
  return parsed.success ? { ok: true, entry, props: parsed.data } : { ok: false, reason: "invalid-props" };
};
