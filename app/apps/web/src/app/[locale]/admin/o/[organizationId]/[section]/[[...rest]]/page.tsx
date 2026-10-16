import { SettingsSectionPage } from "@/client/settings-section-pages";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("settings");

// Next.js requires pages as a default export.
export default function Page() {
  return <SettingsSectionPage />;
}
