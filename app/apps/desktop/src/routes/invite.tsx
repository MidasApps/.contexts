import { InviteView } from "@core/client/views/invite";
import { createFileRoute } from "@tanstack/react-router";

// `/invite#token=`: the view reads the fragment once and signs in on the page itself (decision 0012).
export const Route = createFileRoute("/invite")({ component: InviteView });
