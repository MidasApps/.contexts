"use client";

import { parseMoneyInput, type MoneyValue, type ParseMoneyInputError } from "@core/i18n";
import { useId, useState, type ComponentProps } from "react";
import { useLocale } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { textControlClasses } from "#/shared/ui/atoms/Input/input-styles.ts";
import { formatMoneyInputText } from "./money-input-text.ts";

export type MoneyInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type"> & {
  /** Money as the API carries it (`contracts/api.md` §8.2); `null` when empty. */
  value: MoneyValue | null;
  /** Currency used for new input and for the suffix (ISO 4217). */
  currency: string;
  onValueChange: (value: MoneyValue | null) => void;
  /** Called on blur with the parse error code, or `null` once the text is valid again. */
  onParseError?: (error: ParseMoneyInputError | null) => void;
};

/**
 * Money field (SP2 spec §5): the user types in the locale's format ("1.234,56" in pt-BR); on blur
 * the text is parsed with `parseMoneyInput` into integer minor units and reformatted. The
 * currency code sits beside the input and is part of its description. Mono, tabular digits
 * (DESIGN.md "Mono para precisão"). Validation messages belong to the surrounding `Field`.
 */
export function MoneyInput({
  value,
  currency,
  onValueChange,
  onParseError,
  className,
  onBlur,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: MoneyInputProps) {
  const locale = useLocale();
  const suffixId = useId();
  const [text, setText] = useState(() => (value === null ? "" : formatMoneyInputText(value, locale)));
  const [parseFailed, setParseFailed] = useState(false);

  const commit = (): void => {
    if (text.trim() === "") {
      setParseFailed(false);
      onParseError?.(null);
      onValueChange(null);
      return;
    }
    const parsed = parseMoneyInput(text, locale, currency);
    setParseFailed(!parsed.ok);
    onParseError?.(parsed.ok ? null : parsed.error);
    if (!parsed.ok) return;
    const next = { amountMinor: parsed.amountMinor, currency };
    setText(formatMoneyInputText(next, locale));
    onValueChange(next);
  };

  return (
    <div data-slot="money-input" className={cn("relative flex items-center", className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => {
          commit();
          onBlur?.(event);
        }}
        aria-describedby={[describedBy, suffixId].filter(Boolean).join(" ")}
        aria-invalid={parseFailed || ariaInvalid === true || ariaInvalid === "true" || undefined}
        className={cn(textControlClasses, "h-9 py-2 pr-14 pl-3 text-right font-mono tabular-nums")}
        {...props}
      />
      <span
        id={suffixId}
        className="pointer-events-none absolute right-3 font-mono text-xs text-muted-foreground"
      >
        {currency}
      </span>
    </div>
  );
}
