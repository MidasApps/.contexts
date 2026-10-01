import { NotFoundView } from "@core/client/views/not-found";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("notFound");

/** Any path of the locale tree outside the route map (and `notFound()` from a layout). */
// Next.js requires not-found as a default export.
export default function NotFound() {
  return (
    <main id="main" className="px-6">
      <NotFoundView />
    </main>
  );
}
