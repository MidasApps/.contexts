"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { VisuallyHidden } from "#/shared/ui/atoms/VisuallyHidden/VisuallyHidden.tsx";

const pageName = (): string => (document.title || document.querySelector("h1")?.textContent || "").trim();

/**
 * Announces client-side navigations on desktop (rules/accessibility.md, SP2 spec §12); the web uses
 * Next's announcer. After each path change (not the first render) it reads the new page's title,
 * else its `h1`, into a polite live region that stays mounted.
 */
export function RouteAnnouncer() {
  const t = useTranslations("shell.routeAnnouncer");
  const path = useRouter().useLocationPath();
  const previous = useRef(path);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (previous.current === path) return undefined;
    previous.current = path;
    // Wait a frame so the new page has rendered its title and heading.
    const frame = requestAnimationFrame(() => setMessage(pageName() || t("fallback")));
    return () => cancelAnimationFrame(frame);
  }, [path, t]);
  return (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true" data-slot="route-announcer">
      {message}
    </VisuallyHidden>
  );
}
