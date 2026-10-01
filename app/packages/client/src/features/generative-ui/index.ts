// Public API of the generative-ui feature (SP4 Task 10, decision 0032): the typed component
// registry and the part that renders a tool's `{ ui: { component, props } }`.
export { GenerativeUiProvider, useGenerativeUi, type GenerativeUiEnvironment, type GenerativeUiProviderProps, type SubmissionOrigin } from "./model/generative-ui-context.tsx";
export {
  createUiRegistry,
  resolveGenerativeUi,
  uiEntry,
  UiRegistryError,
  type GenerativeComponentProps,
  type UiRegistry,
  type UiRegistryEntry,
  type UiResolution,
} from "./model/ui-registry.ts";
export { ApprovalDiff, diffPropsOf } from "./ui/components/approval-diff-part.tsx";
export { CORE_UI_COMPONENTS } from "./ui/core-components.ts";
export { GenerativePart, GenerativeUiError, type GenerativePartProps } from "./ui/generative-part.tsx";
