import { SettingsIndexView } from "@core/client/views/settings-index";
import { createFileRoute } from "@tanstack/react-router";

// `/o/:organizationId/settings` without a section opens the first readable section.
export const Route = createFileRoute("/o/$organizationId/settings/")({ component: SettingsIndexView });
