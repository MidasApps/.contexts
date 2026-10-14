import { AdminHomeView } from "@core/client/views/admin-home";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("administration");

/** `/admin`: the view opens the administration of the last organization used. */
// Next.js requires pages as a default export.
export default function Page() {
  return <AdminHomeView />;
}
