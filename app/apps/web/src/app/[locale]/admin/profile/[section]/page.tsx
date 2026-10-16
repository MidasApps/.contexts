import { ProfileSectionPage } from "@/client/profile-section-pages";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("profile");

// Next.js requires pages as a default export.
export default function Page() {
  return <ProfileSectionPage />;
}
