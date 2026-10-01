"use client";

import type { ApprovalDiffProps } from "@core/contracts";
import { useTranslations } from "use-intl";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "#/shared/ui/atoms/Table/Table.tsx";
import type { GenerativeComponentProps } from "../../model/ui-registry.ts";

const display = (value: unknown, none: string): string => {
  if (value === undefined || value === null || value === "") return none;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value) ?? none;
};

/** The before/after table of a change (also used inside the approval card). */
export function ApprovalDiff({ before, after, fields }: ApprovalDiffProps) {
  const t = useTranslations("chat.approval");
  const none = t("none");
  return (
    <Table data-slot="approval-diff" scrollLabel={t("diffCaption")}>
      <TableCaption className="sr-only">{t("diffCaption")}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("field")}</TableHead>
          <TableHead>{t("before")}</TableHead>
          <TableHead>{t("after")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((field) => (
          <TableRow key={field} className="hover:bg-transparent">
            <TableHead scope="row" className="font-mono text-[12.5px] font-normal">
              {field}
            </TableHead>
            <TableCell className="text-muted-foreground">{display(before?.[field], none)}</TableCell>
            <TableCell className="font-medium text-foreground">{display(after[field], none)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** `approval-diff` (SP4 spec §5.2) as a registry component. */
export function ApprovalDiffPart({ props }: GenerativeComponentProps<ApprovalDiffProps>) {
  return <ApprovalDiff {...props} />;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * `approval-diff` props from the `{ before, after }` a tool preview carries: the fields of
 * `after` that differ from `before` (all of them for a create). `null` when there is nothing
 * tabular to show.
 */
export const diffPropsOf = (preview: { readonly before: unknown; readonly after: unknown } | null): ApprovalDiffProps | null => {
  if (preview === null || !isRecord(preview.after)) return null;
  const before = isRecord(preview.before) ? preview.before : null;
  const after = preview.after;
  const fields = Object.keys(after).filter((field) => before === null || !same(before[field], after[field]));
  return fields.length === 0 ? null : { before, after, fields: fields.slice(0, 100) };
};
