"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Field, FieldControl, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { formatUsdPriceText, parseUsdPriceText } from "../model/usd-price-text.ts";

export type PriceInputProps = {
  label: string;
  /** Keeps the label for screen readers only (a table cell under its column header). */
  labelHidden?: boolean;
  /** Micro-USD per 1M tokens; `null` starts the field empty. */
  value: number | null;
  /** Micro-USD per 1M tokens, or `null` while the text is not a price. */
  onValueChange: (microUsd: number | null) => void;
  disabled?: boolean;
};

/**
 * A price per 1M tokens typed in USD in the locale's format. It reports every keystroke so the save
 * button knows at once whether the page holds a price it cannot send; on blur a valid price is
 * rewritten in the locale's format.
 */
export function PriceInput({ label, labelHidden = false, value, onValueChange, disabled = false }: PriceInputProps) {
  const t = useTranslations("admin.models.prices");
  const locale = useLocale();
  const [text, setText] = useState(() => (value === null ? "" : formatUsdPriceText(value, locale)));
  // An empty field of the add form is not an error until someone types in it.
  const [touched, setTouched] = useState(false);
  const parsed = parseUsdPriceText(text, locale);
  const error = !touched || parsed !== null ? undefined : t(text.trim() === "" ? "requiredPrice" : "invalidPrice");
  return (
    <Field className="min-w-28 gap-1">
      <FieldLabel className={cn(labelHidden && "sr-only")}>{label}</FieldLabel>
      <FieldControl>
        <Input
          inputMode="decimal"
          autoComplete="off"
          value={text}
          disabled={disabled}
          className="text-end font-mono tabular-nums"
          onChange={(event) => {
            setText(event.target.value);
            setTouched(true);
            onValueChange(parseUsdPriceText(event.target.value, locale));
          }}
          onBlur={() => {
            if (parsed !== null) setText(formatUsdPriceText(parsed, locale));
          }}
        />
      </FieldControl>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
