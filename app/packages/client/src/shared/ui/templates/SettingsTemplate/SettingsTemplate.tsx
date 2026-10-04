import type { ReactNode } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type SettingsTemplateProps = {
  /** Page header (title `h1` + description), usually the `page-header` widget. */
  header: ReactNode;
  /** Section links (the `settings-nav`/`profile-nav` widget renders the list and marks the current one). */
  navigation: ReactNode;
  /** Accessible name of the section navigation ("Settings sections"). */
  navigationLabel: string;
  /**
   * `reading` (default) caps forms and text at ~720 px; `wide` lets sections whose main content
   * is a data table use the whole column, so its columns and row actions fit.
   */
  width?: "reading" | "wide" | undefined;
  children: ReactNode;
  className?: string;
};

/**
 * Settings and profile pages inside the app shell's `main`: header, then a labelled section `nav`
 * (a 220 px column from `lg`, the pill row above the content below it, so tablets keep the width
 * for the content) and the section content, whose blocks are spaced by the template.
 */
export function SettingsTemplate({
  header,
  navigation,
  navigationLabel,
  width = "reading",
  children,
  className,
}: SettingsTemplateProps) {
  return (
    <div data-slot="settings-template" className={cn("flex flex-col gap-6", className)}>
      {header}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav aria-label={navigationLabel} className="shrink-0 lg:w-[220px]">
          {navigation}
        </nav>
        <section
          data-width={width}
          className={cn("flex min-w-0 flex-1 flex-col gap-6", width === "reading" && "max-w-[720px]")}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
