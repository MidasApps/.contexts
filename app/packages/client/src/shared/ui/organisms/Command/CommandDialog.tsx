"use client";

import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { useShortcut } from "#/shared/lib/shortcuts/use-shortcut.ts";
import { Command, CommandInput, CommandList } from "#/shared/ui/molecules/Command/Command.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";

/** ⌘K / Ctrl+K (atalhos.html "Abrir command palette"). */
export const COMMAND_PALETTE_KEY = "k";

/** Opens the palette with ⌘K / Ctrl+K from anywhere, including text fields. */
export const useCommandShortcut = (onOpen: () => void, enabled = true): void => {
  useShortcut({ key: COMMAND_PALETTE_KEY, onTrigger: onOpen, enabled });
};

export type CommandDialogProps = Omit<ComponentProps<typeof Dialog>, "children"> & {
  /** Groups and items (`CommandGroup`/`CommandItem` from the Command molecule) and `CommandEmpty`. */
  children: ReactNode;
  className?: string;
  /** Controlled search text (e.g. to reset on close). */
  search?: string;
  onSearchChange?: (search: string) => void;
};

/**
 * shadcn `CommandDialog`: the command palette as a modal (focus trapped, Esc closes and returns
 * focus). Title and description are visually hidden but announced; the search box and the result
 * list carry translated names. componentes.html `.cmd` look on `--popover`.
 */
export function CommandDialog({ children, className, search, onSearchChange, ...dialogProps }: CommandDialogProps) {
  const t = useTranslations("shell.commandPalette");
  return (
    <Dialog {...dialogProps}>
      <DialogContent className={cn("gap-0 overflow-hidden p-0 sm:max-w-xl", className)} showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Command label={t("search")} className="bg-popover [&_[data-slot=command-input-wrapper]]:h-12">
          <CommandInput
            placeholder={t("placeholder")}
            {...(search === undefined ? {} : { value: search })}
            {...(onSearchChange === undefined ? {} : { onValueChange: onSearchChange })}
          />
          <CommandList label={t("results")} className="max-h-[min(60vh,400px)] p-1">
            {children}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
