import { SettingsIndexView } from "@core/client/views/settings-index";
import { createFileRoute } from "@tanstack/react-router";

// `/admin/o/:organizationId` without a section opens the first readable section (decision 0077).
export const Route = createFileRoute("/admin/o/$organizationId/")({ component: SettingsIndexView });
