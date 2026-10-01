import { createFileRoute } from "@tanstack/react-router";
import { SettingsSectionPage } from "@/pages/section-views.tsx";

export const Route = createFileRoute("/o/$organizationId/settings/$section")({ component: SettingsSection });

function SettingsSection() {
  return <SettingsSectionPage section={Route.useParams().section} />;
}
