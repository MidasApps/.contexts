"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { textControlClasses } from "#/shared/ui/atoms/Input/input-styles.ts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/shared/ui/molecules/Command/Command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "#/shared/ui/molecules/Popover/Popover.tsx";

export type ComboboxOption = { value: string; label: string; keywords?: readonly string[] };
export type ComboboxGroup = { heading?: string; options: readonly ComboboxOption[] };

export type ComboboxProps = Omit<ComponentProps<"button">, "value" | "onChange" | "children"> & {
  groups: readonly ComboboxGroup[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  /** Shown on the trigger while nothing is selected. */
  placeholder: string;
  /** Accessible name of the search box inside the popover. */
  searchLabel: string;
  /** Text when the search matches nothing. */
  emptyText: string;
  /** Optional search box placeholder (the label is still `searchLabel`). */
  searchPlaceholder?: string;
};

const normalize = (text: string): string =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("en-US");

/**
 * Substring filter (every typed word must appear in the value, label or keywords, accents and case
 * ignored). cmdk's default fuzzy scoring matches "Kolkata" inside "Kentucky/Monticello", which
 * is noise in long lists such as time zones.
 */
export const containsAllTerms = (value: string, search: string, keywords: string[] = []): number => {
  const haystack = normalize([value, ...keywords].join(" "));
  return normalize(search).split(/\s+/u).filter(Boolean).every((term) => haystack.includes(term)) ? 1 : 0;
};

/**
 * Searchable single select (shadcn "combobox" recipe: Popover + Command). The trigger is a
 * `combobox` button labelled by an outside `Label`/`FieldLabel`; the popover holds a labelled search
 * box and a grouped listbox. Selecting closes the popover and returns focus to the trigger.
 */
export function Combobox({
  groups,
  value,
  onValueChange,
  placeholder,
  searchLabel,
  emptyText,
  searchPlaceholder,
  className,
  ...triggerProps
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const resultsLabel = useTranslations("common.search")("results");
  const selected = groups.flatMap((group) => group.options).find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={contentId}
          data-slot="combobox-trigger"
          className={cn(
            textControlClasses,
            "flex h-9 cursor-pointer items-center justify-between gap-2 px-3 text-left",
            selected === undefined && "text-muted-foreground",
            className,
          )}
          {...triggerProps}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent id={contentId} aria-label={searchLabel} className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command label={searchLabel} filter={containsAllTerms}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList label={resultsLabel}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group, index) => (
              <CommandGroup key={group.heading ?? index} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label, ...(option.keywords ?? [])]}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    <CheckIcon
                      aria-hidden="true"
                      className={cn("ml-auto size-4", option.value === value ? "opacity-100" : "opacity-0")}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
