"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { NoAccessState } from "#/shared/ui/molecules/NoAccessState/NoAccessState.tsx";
import {
  SettingsTemplate,
  type SettingsTemplateProps,
} from "#/shared/ui/templates/SettingsTemplate/SettingsTemplate.tsx";

export type SettingsPageFrameProps = {
  /** The page header (`PageHeader` with the section title as the only `h1`). */
  header: ReactNode;
  /** The viewer holds the section's read permission; otherwise the content is a no-access state. */
  allowed: boolean;
  /** `wide` for sections whose main content is a data table (see `SettingsTemplate`). */
  width?: SettingsTemplateProps["width"] | undefined;
  children: ReactNode;
};

/**
 * Frame of every settings page of the administration (decision 0077): header and the section
 * content, or `NoAccessState` when the viewer cannot read the section. The administration's sidebar
 * lists the sections, so it stays usable either way.
 */
export function SettingsPageFrame({ header, allowed, width, children }: SettingsPageFrameProps) {
  const t = useTranslations("settings");
  return (
    <SettingsTemplate header={header} width={allowed ? width : "reading"}>
      {allowed ? children : <NoAccessState description={t("noAccessDescription")} />}
    </SettingsTemplate>
  );
}
