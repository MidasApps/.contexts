"use client";

import { useTranslations } from "use-intl";

/**
 * "Skip to main content", the first focusable element of every page template (rules/accessibility.md
 * "Skip links"): visually hidden until focused, never `display: none`. It focuses `#main` itself
 * because SPA routers and some browsers do not move focus on a same-page fragment.
 */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  const t = useTranslations("shell");
  return (
    <a
      href={`#${targetId}`}
      data-slot="skip-link"
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (target === null) return;
        event.preventDefault();
        target.focus();
      }}
      className="sr-only z-50 rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {t("skipToContent")}
    </a>
  );
}
