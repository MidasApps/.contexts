import { describe, expect, it } from "vitest";
import { bindProjectsPort } from "./projects-port-binding.ts";

const TENANT = "Jd8sK2lPq0WnR5tYu3bV";
const MEMBER = { type: "user", uid: "member-uid", mfa: false } as const;
const scope = { authorize: () => Promise.reject(new Error("unused")), getEffectivePermissions: () => Promise.reject(new Error("unused")) };

type CreateProject = Parameters<typeof bindProjectsPort>[0]["tenancy"]["createProject"];

const bind = (createProject: CreateProject) => bindProjectsPort({ tenancy: { createProject }, access: { forRequest: () => scope } });

describe("bindProjectsPort", () => {
  it("runs SP1 createProject with the caller, a request scope and the tenant", async () => {
    const calls: Parameters<CreateProject>[0][] = [];
    const port = bind((command) => {
      calls.push(command);
      return Promise.resolve({ ok: true, data: { id: "Pr0sK2lPq0WnR5tYu3bV", name: command.input.name } } as never);
    });
    const result = await port.createProject({ principal: MEMBER, tenantId: TENANT, requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3", input: { name: "Launch" } });
    expect(result).toEqual({ ok: true, data: { projectId: "Pr0sK2lPq0WnR5tYu3bV", name: "Launch" } });
    expect(calls[0]).toMatchObject({ actor: MEMBER, tenantId: TENANT, requestId: "01J8Z3K4M5N6P7Q8R9S0T1V2W3", input: { name: "Launch" }, access: scope });
  });

  it("answers FORBIDDEN when SP1 denies", async () => {
    const port = bind(() => Promise.resolve({ ok: false, error: { code: "FORBIDDEN" } } as never));
    expect(await port.createProject({ principal: MEMBER, tenantId: TENANT, requestId: "r", input: { name: "Launch" } })).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("rejects a malformed tenant instead of creating anything", async () => {
    const port = bind(() => Promise.reject(new Error("must not run")));
    await expect(port.createProject({ principal: MEMBER, tenantId: "", requestId: "r", input: { name: "Launch" } })).rejects.toThrow();
  });
});
