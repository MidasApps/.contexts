import type { PermissionDefinition, RoleRef } from "@core/contracts";
import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderApp } from "#/app-shell/testing/render-app.tsx";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { PERMISSION_REGISTRY, permissionDefinition } from "#/shared/testing/settings-fixtures.ts";
import { groupPermissionsByModule, PermissionPicker, RoleChecklist, useRoleOptions } from "./index.ts";

function Roles() {
  const options = useRoleOptions([]);
  const [value, setValue] = useState<RoleRef[]>([{ kind: "system", key: "member" }]);
  return (
    <RoleChecklist
      legend="Papéis"
      options={options}
      value={value}
      onChange={setValue}
      error={value.length === 0 ? "Escolha um papel." : undefined}
    />
  );
}

function Permissions() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <PermissionPicker
      legend="Permissões"
      permissions={PERMISSION_REGISTRY as unknown as PermissionDefinition[]}
      value={value}
      onChange={setValue}
      grantable={(id) => id !== "core.member.read"}
    />
  );
}

describe("role pickers", () => {
  it("groups tenant permissions by module then resource, core first", () => {
    const groups = groupPermissionsByModule([
      permissionDefinition("sample.item.read"),
      permissionDefinition("core.unit.read"),
      { ...permissionDefinition("platform.user.read"), scope: "platform" },
    ] as unknown as PermissionDefinition[]);
    expect(groups.map((group) => group.moduleId)).toEqual(["core", "sample"]);
    expect(groups[0]?.resources.map((resource) => resource.resource)).toEqual(["unit"]);
  });

  it("RoleChecklist lists person system roles with descriptions and reports an empty choice", async () => {
    const { user, container } = renderApp(<Roles />);
    const group = await screen.findByRole("group", { name: "Papéis" });
    expect(within(group).queryByRole("checkbox", { name: "Dispositivo" })).toBeNull();
    await user.click(within(group).getByRole("checkbox", { name: "Membro" }));
    expect(await screen.findByText("Escolha um papel.")).toBeDefined();
    expect(group.getAttribute("aria-invalid")).toBe("true");
    await expectNoAxeViolations(container);
  });

  it("PermissionPicker labels permissions by description and disables what cannot be granted", async () => {
    const { user, container } = renderApp(<Permissions />);
    const members = await screen.findByRole("checkbox", { name: /Ver membros/u });
    expect(members.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /Ver unidades/u }));
    expect(screen.getByText("(1 de 4)")).toBeDefined();
    await expectNoAxeViolations(container);
  });
});
