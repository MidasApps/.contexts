import type { ReactNode } from "react";

// Next.js requires the root layout as a default export.
// `lang` is fixed until i18n lands in SP2 (locale from the request).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
