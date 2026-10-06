"use client";

import { EDITABLE_MODEL_ROLES, type EditableModelRole, type ModelRoleSetting } from "@core/contracts";
import { useId } from "react";
import { useTranslations } from "use-intl";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import type { ModelRow, ModelSettingsFormState } from "../model/model-settings-form.ts";

const isEditable = (role: ModelRoleSetting["role"]): role is EditableModelRole =>
  (EDITABLE_MODEL_ROLES as readonly string[]).includes(role);

/** "US$ 0,10 entrada · US$ 0,50 saída por 1M": what a model costs. */
const usePriceText = () => {
  const t = useTranslations("admin.models.roles");
  const formatCost = useFormatMicroUsd();
  return (row: ModelRow): string =>
    t("price", {
      input: formatCost(row.inputMicroUsdPerMTok, "exact"),
      output: formatCost(row.outputMicroUsdPerMTok, "exact"),
    });
};

function RoleHeading({ role, htmlFor }: { role: ModelRoleSetting["role"]; htmlFor?: string }) {
  const t = useTranslations("admin.models.roles");
  return (
    <span className="flex flex-col gap-0.5">
      {htmlFor === undefined ? (
        <span className="text-body font-medium">{t(`names.${role}`)}</span>
      ) : (
        <Label htmlFor={htmlFor}>{t(`names.${role}`)}</Label>
      )}
      <span className="text-xs text-muted-foreground">{t(`hints.${role}`)}</span>
    </span>
  );
}

function FixedRole({ setting }: { setting: ModelRoleSetting }) {
  const t = useTranslations("admin.models.roles");
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start">
      <RoleHeading role={setting.role} />
      <span className="flex flex-col gap-0.5">
        <span className="font-mono text-body-sm">{setting.modelId}</span>
        <span className="text-xs text-muted-foreground">{t("fixedNote")}</span>
      </span>
    </li>
  );
}

type EditableRoleProps = {
  role: EditableModelRole;
  form: ModelSettingsFormState;
  disabled: boolean;
  onChange: (role: EditableModelRole, modelId: string) => void;
};

function EditableRole({ role, form, disabled, onChange }: EditableRoleProps) {
  const t = useTranslations("admin.models.roles");
  const priceText = usePriceText();
  const id = useId();
  const current = form.roles[role];
  const selected = form.rows.find((row) => row.modelId === current);
  // Embedding models produce vectors, not text. A staff price left out of the save may leave the
  // list, so it is offered only while chosen.
  const options = form.rows.filter((row) => row.kind === "text" && (!row.dropped || row.modelId === current));
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start">
      <RoleHeading role={role} htmlFor={id} />
      <span className="flex min-w-0 flex-col gap-1">
        <Select value={current} onValueChange={(modelId) => onChange(role, modelId)} disabled={disabled}>
          <SelectTrigger id={id} className="w-full max-w-xl" aria-describedby={`${id}-price`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selected === undefined && current !== "" ? <SelectItem value={current}>{current}</SelectItem> : null}
            {options.map((row) => (
              <SelectItem key={row.modelId} value={row.modelId} disabled={row.available === false}>
                {row.available === false
                  ? t("unavailableOption", { model: row.modelId, price: priceText(row) })
                  : t("option", { model: row.modelId, price: priceText(row) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span id={`${id}-price`} className="text-xs text-muted-foreground">
          {selected === undefined ? t("noPrice") : priceText(selected)}
        </span>
      </span>
    </li>
  );
}

export type ModelRolesSectionProps = {
  roles: readonly ModelRoleSetting[];
  form: ModelSettingsFormState;
  disabled: boolean;
  onChange: (role: EditableModelRole, modelId: string) => void;
};

/** "Modelo de cada função": a model picker per text role, the other roles read only, in the order received. */
export function ModelRolesSection({ roles, form, disabled, onChange }: ModelRolesSectionProps) {
  const t = useTranslations("admin.models.roles");
  return (
    <SectionCard title={t("title")} description={t("description")}>
      <ul className="flex flex-col divide-y divide-border">
        {roles.map((setting) =>
          setting.editable && isEditable(setting.role) ? (
            <EditableRole key={setting.role} role={setting.role} form={form} disabled={disabled} onChange={onChange} />
          ) : (
            <FixedRole key={setting.role} setting={setting} />
          ),
        )}
      </ul>
    </SectionCard>
  );
}
