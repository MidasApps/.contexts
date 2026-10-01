import type { Organization } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { buildOrganization } from "#/shared/testing/fixtures.ts";
import { changedOrganization, organizationFormValues } from "./organization-form.contract.ts";

describe("update-organization", () => {
  it("rebuilds the PATCH body with the name and only the changed defaults", () => {
    const initial = organizationFormValues(buildOrganization() as unknown as Organization);
    expect(changedOrganization(initial, initial)).toBeNull();
    expect(changedOrganization(initial, { ...initial, name: "Contoso", timeZone: "America/Recife" })).toEqual({ name: "Contoso", defaults: { timeZone: "America/Recife" } });
  });
});
