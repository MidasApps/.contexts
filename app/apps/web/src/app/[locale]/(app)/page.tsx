import { HomeView } from "@core/client/views/home";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("home");

// Next.js requires pages as a default export.
export default function Page() {
  return <HomeView />;
}
