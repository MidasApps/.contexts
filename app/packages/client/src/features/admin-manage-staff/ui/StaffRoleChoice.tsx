"use client";

import { PLATFORM_ROLES, type PlatformRole } from "@core/contracts";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { RadioGroup, RadioGroupItem } from "#/shared/ui/atoms/RadioGroup/RadioGroup.tsx";

const isRole = (value: string): value is PlatformRole => (PLATFORM_ROLES as readonly string[]).includes(value);

/** The two fixed staff roles (decision 0075), each with what it may do. */
export function StaffRoleChoice({ value, onChange }: { value: PlatformRole; onChange: (role: PlatformRole) => void }) {
  const t = useTranslations("admin.team.roles");
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{t("legend")}</legend>
      <RadioGroup value={value} onValueChange={(next) => isRole(next) && onChange(next)}>
        {PLATFORM_ROLES.map((role) => (
          <div key={role} className="flex items-start gap-2">
            <RadioGroupItem id={`${id}-${role}`} value={role} aria-describedby={`${id}-${role}-hint`} />
            <Label htmlFor={`${id}-${role}`} className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">{t(`${role}.name`)}</span>
              <span id={`${id}-${role}-hint`} className="text-caption text-muted-foreground">
                {t(`${role}.description`)}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
