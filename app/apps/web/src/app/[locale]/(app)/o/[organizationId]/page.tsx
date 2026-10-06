import { OrganizationHomeView } from "@core/client/views/organization-home";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("organization");

// Next.js requires pages as a default export.
export default function Page() {
  return <OrganizationHomeView />;
}
