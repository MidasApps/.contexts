"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";

export type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

/**
 * Password input with a show/hide toggle (`aria-pressed`, labelled). Put it inside `FieldControl`
 * so the label, hint and error are wired to the input itself; the toggle keeps its own name.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const t = useTranslations("common.password");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={visible}
        className="absolute top-1/2 right-1 -translate-y-1/2"
        onClick={() => setVisible((current) => !current)}
      >
        <Icon name={visible ? "eye-off" : "eye"} />
        <span className="sr-only">{t("show")}</span>
      </Button>
    </div>
  );
}
