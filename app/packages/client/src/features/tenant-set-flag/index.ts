// Public API of the tenant-set-flag feature (SP5 Task 14): an organization's own flag override.

// Decision 0066: the organization removes its own override and follows the platform again.
export {
  TenantClearFlagOverrideDialog,
  type TenantClearFlagOverrideDialogProps,
} from "./ui/TenantClearFlagOverrideDialog.tsx";
export {
  type TenantFlagChange,
  TenantSetFlagDialog,
  type TenantSetFlagDialogProps,
} from "./ui/TenantSetFlagDialog.tsx";
