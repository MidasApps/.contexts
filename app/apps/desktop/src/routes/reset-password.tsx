import { ResetPasswordView } from "@core/client/views/reset-password";
import { createFileRoute } from "@tanstack/react-router";

// Anonymous entry page: asks Firebase to email a password reset link (SH-02).
export const Route = createFileRoute("/reset-password")({ component: ResetPasswordView });
