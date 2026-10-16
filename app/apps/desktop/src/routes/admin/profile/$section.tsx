import { createFileRoute } from "@tanstack/react-router";
import { ProfileSectionPage } from "@/pages/section-views.tsx";

export const Route = createFileRoute("/admin/profile/$section")({ component: ProfileSection });

function ProfileSection() {
  return <ProfileSectionPage section={Route.useParams().section} />;
}
