"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { type ComponentProps, useRef } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { textControlClasses } from "#/shared/ui/atoms/Input/input-styles.ts";

export type SearchFieldProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name; defaults to `common.search.label`. Pass `aria-labelledby` to use a visible label. */
  label?: string;
};

/**
 * Search box (componentes.html `.cmd` look): magnifier, `type="search"` (Esc clears natively), and
 * a clear button that returns focus to the input. The consumer debounces/filters.
 */
export function SearchField({ value, onValueChange, label, className, placeholder, ...props }: SearchFieldProps) {
  const t = useTranslations("common.search");
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLabelledBy = props["aria-labelledby"] !== undefined;
  return (
    <div data-slot="search-field" className={cn("relative flex items-center", className)}>
      <SearchIcon className="pointer-events-none absolute start-3 size-4 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={hasLabelledBy ? undefined : (label ?? t("label"))}
        placeholder={placeholder ?? t("placeholder")}
        className={cn(textControlClasses, "h-9 pe-9 ps-9 [&::-webkit-search-cancel-button]:hidden")}
        {...props}
      />
      {value === "" ? null : (
        <button
          type="button"
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          className="absolute end-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t("clear")}</span>
        </button>
      )}
    </div>
  );
}
