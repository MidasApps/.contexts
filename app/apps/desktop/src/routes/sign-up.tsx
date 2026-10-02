import { SignUpView } from "@core/client/views/sign-up";
import { createFileRoute } from "@tanstack/react-router";

// Anonymous entry page (decision 0050): open sign-up when VITE_SELF_SERVE_SIGN_UP is true.
export const Route = createFileRoute("/sign-up")({ component: SignUpView });
