// Public API of the generative-ui feature (SP4 Task 10, decision 0032): the typed component
// registry and the part that renders a tool's `{ ui: { component, props } }`.
export {
  type GenerativeUiEnvironment,
  GenerativeUiProvider,
  type GenerativeUiProviderProps,
  type SubmissionOrigin,
  useGenerativeUi,
} from "./model/generative-ui-context.tsx";
export {
  createUiRegistry,
  type GenerativeComponentProps,
  resolveGenerativeUi,
  type UiRegistry,
  type UiRegistryEntry,
  UiRegistryError,
  type UiResolution,
  uiEntry,
} from "./model/ui-registry.ts";
export { ApprovalDiff, diffPropsOf } from "./ui/components/approval-diff-part.tsx";
export { CORE_UI_COMPONENTS } from "./ui/core-components.ts";
export { GenerativePart, type GenerativePartProps, GenerativeUiError } from "./ui/generative-part.tsx";
