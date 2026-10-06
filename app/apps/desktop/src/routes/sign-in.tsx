import { SignInView } from "@core/client/views/sign-in";
import { createFileRoute } from "@tanstack/react-router";

// Anonymous entry page (SP2 spec §4); a signed-in session is sent on to `?next=` by the view.
export const Route = createFileRoute("/sign-in")({ component: SignInView });
