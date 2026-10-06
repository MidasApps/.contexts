"use client";

import { ServerErrorView } from "@core/client/views/server-error";

/**
 * A render error under `/{locale}` (a page, or a layout below the root one such as the user area's
 * session check): the translated error page with the server's `digest` as the reference and
 * `retry()`. It renders inside the locale layout, so every client provider is there. Errors of
 * the root layout itself reach `app/global-error.tsx` (UX review U-07).
 */
// Next.js requires the error boundary as a default export.
export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ServerErrorView error={error} reference={error.digest} onRetry={retry} />;
}
