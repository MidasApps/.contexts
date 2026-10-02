"use client";

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { textControlClasses } from "#/shared/ui/atoms/Input/input-styles.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";

export type CopyFieldProps = {
  label: string;
  value: string;
  /** Secrets (API keys, activation codes): masked until revealed; copying works while masked. */
  sensitive?: boolean;
  /** Hint under the field (e.g. "shown only once"). */
  description?: string;
  className?: string;
  /** Clipboard writer; defaults to `navigator.clipboard.writeText` (injectable for tests/desktop). */
  writeText?: (text: string) => Promise<void>;
};

const COPIED_MS = 2000;
const MASK = "••••••••••••••••";

const defaultWriteText = (text: string): Promise<void> => navigator.clipboard.writeText(text);

/**
 * Read-only value with a copy button and a polite live region that announces "Copied" (or the
 * failure). `sensitive` masks the value with a reveal toggle (`aria-pressed`). Mono, as values and
 * IDs are in DESIGN.md.
 */
export function CopyField({ label, value, sensitive = false, description, className, writeText = defaultWriteText }: CopyFieldProps) {
  const t = useTranslations("common.copy");
  const id = useId();
  const [revealed, setRevealed] = useState(!sensitive);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status !== "copied") return undefined;
    const timer = setTimeout(() => setStatus("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async (): Promise<void> => {
    try {
      await writeText(value);
      setStatus("copied");
    } catch {
      // Clipboard permission denied or unavailable: tell the user to copy manually.
      setStatus("failed");
    }
  };

  return (
    <div data-slot="copy-field" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={`${id}-value`} className="text-body">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-value`}
          readOnly
          value={revealed ? value : MASK}
          aria-describedby={description === undefined ? undefined : `${id}-description`}
          className={cn(textControlClasses, "h-9 px-3 font-mono text-body tabular-nums")}
          onFocus={(event) => revealed && event.currentTarget.select()}
        />
        {sensitive ? (
          <Button variant="secondary" size="icon" aria-pressed={revealed} onClick={() => setRevealed((current) => !current)}>
            {revealed ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
            <span className="sr-only">{revealed ? t("hide") : t("reveal")}</span>
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => void copy()}>
          {status === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {t("copy")}
        </Button>
      </div>
      {description === undefined ? null : (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      <p role="status" className={cn("text-xs", status === "failed" ? "text-destructive-text" : "sr-only")}>
        {status === "copied" ? t("copied") : status === "failed" ? t("failed") : ""}
      </p>
    </div>
  );
}
