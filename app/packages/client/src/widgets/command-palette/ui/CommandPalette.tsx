"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { useCurrentNode } from "#/entities/session/index.ts";
import { CreateProjectDialog } from "#/features/create-project/index.ts";
import { useShellUi } from "#/shared/lib/shell/shell-ui-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import { CommandEmpty, CommandGroup, CommandItem } from "#/shared/ui/molecules/Command/Command.tsx";
import { CommandDialog, useCommandShortcut } from "#/shared/ui/organisms/Command/CommandDialog.tsx";
import {
  type PaletteCommand,
  type PaletteGroup,
  type PaletteGroupStatus,
  usePaletteCommands,
} from "../model/use-palette-commands.ts";

const GROUPS: readonly PaletteGroup[] = ["navigation", "organizations", "projects", "actions"];

function CommandEntry({
  command,
  value,
  onRun,
}: {
  command: PaletteCommand;
  value: string;
  onRun: (command: PaletteCommand) => void;
}) {
  return (
    <CommandItem value={value} keywords={[...command.keywords]} onSelect={() => onRun(command)}>
      <Icon name={command.icon} />
      <span className="truncate">{command.label}</span>
    </CommandItem>
  );
}

function LoadingEntry({ status, group }: { status: PaletteGroupStatus | undefined; group: PaletteGroup }) {
  const t = useTranslations("shell.commandPalette");
  if (status !== "pending" && status !== "error") return null;
  return (
    <CommandItem value={`${group}:status`} disabled>
      {status === "pending" ? <Spinner decorative /> : <Icon name="alert-triangle" />}
      {status === "pending" ? t("loading") : t("groupFailed")}
    </CommandItem>
  );
}

export type CommandPaletteProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * The command palette (⌘K / Ctrl+K from anywhere, SP2 spec §9): recent commands first (persisted
 * in the shell UI store), then navigation allowed at the node, organizations, projects and
 * actions. Running a command closes the palette and records it as recent.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const t = useTranslations("shell.commandPalette");
  const node = useCurrentNode();
  const [search, setSearch] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const recents = useShellUi((state) => state.recents);
  const addRecent = useShellUi((state) => state.addRecent);
  const { commands, status } = usePaletteCommands({ onCreateProject: () => setCreatingProject(true) });
  useCommandShortcut(() => onOpenChange(true));
  // What had focus before the palette opened (read before the dialog moves focus into itself), so a
  // dialog a command opens can hand focus back there.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
  }, [open]);

  const close = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };
  const run = (command: PaletteCommand) => {
    addRecent(command.id);
    close(false);
    command.run();
  };
  const recent = search === "" ? recents.flatMap((id) => commands.filter((command) => command.id === id)) : [];

  return (
    <>
      <CommandDialog open={open} onOpenChange={close} search={search} onSearchChange={setSearch}>
        <CommandEmpty>{t("empty")}</CommandEmpty>
        {recent.length === 0 ? null : (
          <CommandGroup heading={t("groups.recent")}>
            {recent.map((command) => (
              <CommandEntry key={command.id} command={command} value={`recent:${command.id}`} onRun={run} />
            ))}
          </CommandGroup>
        )}
        {GROUPS.map((group) => {
          const entries = commands.filter((command) => command.group === group);
          const groupStatus = group === "organizations" || group === "projects" ? status[group] : undefined;
          if (entries.length === 0 && groupStatus !== "pending" && groupStatus !== "error") return null;
          return (
            <CommandGroup key={group} heading={t(`groups.${group}`)}>
              {entries.map((command) => (
                <CommandEntry key={command.id} command={command} value={command.id} onRun={run} />
              ))}
              <LoadingEntry status={groupStatus} group={group} />
            </CommandGroup>
          );
        })}
      </CommandDialog>
      {node === null ? null : (
        <CreateProjectDialog
          organizationId={node.organizationId}
          open={creatingProject}
          onOpenChange={setCreatingProject}
          returnFocusTo={() => opener.current}
        />
      )}
    </>
  );
}
