import { ResetPasswordView } from "@core/client/views/reset-password";
import { pageMetadata } from "@/server/page-metadata";

export const generateMetadata = pageMetadata("resetPassword");

// Next.js requires pages as a default export.
export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
