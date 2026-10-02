"use client";

import { useState, type ComponentProps } from "react";
import { useLocale } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { textControlClasses } from "#/shared/ui/atoms/Input/input-styles.ts";
import { formatIntegerInputText, parseIntegerInput } from "./integer-input-text.ts";

export type IntegerInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "type"> & {
  /** The count; `null` when empty. */
  value: number | null;
  /** Called on blur with the parsed count, or `null` when the text is empty or not a count. */
  onValueChange: (value: number | null) => void;
  /** Called on blur: `true` when the text is not a whole count, `false` once it is again. */
  onParseError?: (invalid: boolean) => void;
};

/**
 * Whole-count field (token caps and the like): the user types digits, with or without the
 * locale's thousands separator; on blur the text is parsed and shown grouped ("20.000.000"), so
 * large caps read at a glance. Mono, tabular digits like `MoneyInput`. Messages belong to the
 * surrounding field.
 */
export function IntegerInput({ value, onValueChange, onParseError, className, onBlur, onChange, "aria-invalid": ariaInvalid, ...props }: IntegerInputProps) {
  const locale = useLocale();
  const [text, setText] = useState(() => (value === null ? "" : formatIntegerInputText(value, locale)));
  const [parseFailed, setParseFailed] = useState(false);

  const commit = (): void => {
    if (text.trim() === "") {
      setParseFailed(false);
      onParseError?.(false);
      onValueChange(null);
      return;
    }
    const parsed = parseIntegerInput(text, locale);
    setParseFailed(parsed === null);
    onParseError?.(parsed === null);
    onValueChange(parsed);
    if (parsed !== null) setText(formatIntegerInputText(parsed, locale));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      aria-invalid={parseFailed || ariaInvalid === true || ariaInvalid === "true" || undefined}
      {...props}
      className={cn(textControlClasses, "h-9 px-3 py-2 text-right font-mono tabular-nums", className)}
    />
  );
}
