import { SettingsModuleView } from "@core/client/views/settings-module";
import { createFileRoute } from "@tanstack/react-router";

// Module settings rendered from the module's settings contract (decision 0015).
export const Route = createFileRoute("/admin/o/$organizationId/m/$moduleId")({ component: SettingsModuleView });
