import { AdminHomeView } from "@core/client/views/admin-home";
import { createFileRoute } from "@tanstack/react-router";

// `/admin` opens the administration of the last organization used (decision 0077).
export const Route = createFileRoute("/admin/")({ component: AdminHomeView });
