// Public API of the revoke-session feature (SP2 Task 14): revoke one session or all of them.
export { useRevokeAllSessions, useRevokeSession } from "./model/use-revoke-session.ts";
export {
  RevokeSessionDialog,
  type RevokeSessionDialogProps,
  SignOutEverywhereButton,
} from "./ui/RevokeSessionDialogs.tsx";
