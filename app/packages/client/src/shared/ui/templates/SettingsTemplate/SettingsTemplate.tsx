import type { ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type SettingsTemplateProps = {
  /** Page header (title `h1` + description), usually the `page-header` widget. */
  header: ReactNode;
  /** Section links (the `settings-nav`/`profile-nav` widget renders the list and marks the current one). */
  navigation: ReactNode;
  /** Accessible name of the section navigation ("Settings sections"). */
  navigationLabel: string;
  children: ReactNode;
  className?: string;
};

/**
 * Settings and profile pages inside the app shell's `main`: header, then a labelled section `nav`
 * (a 220 px column from `md`, stacked above the content on small screens) and the section content
 * capped for comfortable reading (~720 px).
 */
export function SettingsTemplate({ header, navigation, navigationLabel, children, className }: SettingsTemplateProps) {
  return (
    <div data-slot="settings-template" className={cn("flex flex-col gap-6", className)}>
      {header}
      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={navigationLabel} className="shrink-0 md:w-[220px]">
          {navigation}
        </nav>
        <section className="min-w-0 max-w-[720px] flex-1">{children}</section>
      </div>
    </div>
  );
}
