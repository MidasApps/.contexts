import { SettingsIndexView } from "@core/client/views/settings-index";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("settings");

/** `/o/:organizationId/settings` without a section: the view opens the first readable section. */
// Next.js requires pages as a default export.
export default function Page() {
  return <SettingsIndexView />;
}
