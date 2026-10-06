import { createFileRoute } from "@tanstack/react-router";
import { SettingsSectionPage } from "@/pages/section-views.tsx";

export const Route = createFileRoute("/o/$organizationId/settings/$section/$")({ component: SettingsSection });

// The page reads the section from the shared route map, which also rejects unknown tails.
function SettingsSection() {
  return <SettingsSectionPage />;
}
