import { SettingsModuleView } from "@core/client/views/settings-module";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("settings");

// Next.js requires pages as a default export.
export default function Page() {
  return <SettingsModuleView />;
}
