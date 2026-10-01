// Public API of the admin-impersonation feature (SP5 Task 12): read-only, audited support access (SP1 spec §6.6).
export {
  IMPERSONATION_STORAGE_KEY,
  isImpersonationOpen,
  StoredImpersonationSchema,
  useImpersonationStore,
  type StoredImpersonation,
} from "./model/use-impersonation-store.ts";
export { useStoredImpersonation } from "./model/use-stored-impersonation.ts";
export { EndImpersonationSessionDialog, type EndImpersonationSessionDialogProps } from "./ui/EndImpersonationSessionDialog.tsx";
export { OpenImpersonationSession, type OpenImpersonationSessionProps } from "./ui/OpenImpersonationSession.tsx";
export { StartImpersonationForm, type ImpersonationTarget, type StartImpersonationFormProps } from "./ui/StartImpersonationForm.tsx";
