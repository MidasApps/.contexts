// Public API of the admin-impersonation feature (SP5 Task 12): read-only, audited support access (SP1 spec §6.6).
export {
  IMPERSONATION_STORAGE_KEY,
  isImpersonationOpen,
  type StoredImpersonation,
  StoredImpersonationSchema,
  useImpersonationStore,
} from "./model/use-impersonation-store.ts";
export { useStoredImpersonation } from "./model/use-stored-impersonation.ts";
// Follow-up 92: what `/admin` shows in support mode.
export { AdminImpersonationNotice } from "./ui/AdminImpersonationNotice.tsx";
export {
  EndImpersonationSessionDialog,
  type EndImpersonationSessionDialogProps,
} from "./ui/EndImpersonationSessionDialog.tsx";
export { LeaveImpersonationButton } from "./ui/LeaveImpersonationButton.tsx";
export { OpenImpersonationSession, type OpenImpersonationSessionProps } from "./ui/OpenImpersonationSession.tsx";
export {
  type ImpersonationTarget,
  type OrganizationFieldA11y,
  StartImpersonationForm,
  type StartImpersonationFormProps,
} from "./ui/StartImpersonationForm.tsx";
