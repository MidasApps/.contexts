import { OrganizationsView } from "@core/client/views/organizations";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("organizations");

// Next.js requires pages as a default export.
export default function Page() {
  return <OrganizationsView />;
}
