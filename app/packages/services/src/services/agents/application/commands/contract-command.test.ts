import { CreateProjectInputContract, OrganizationContract, PrincipalSchema, TenantIdSchema, defineContract } from "@core/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CommandContractError, defineContractCommand } from "./contract-command.ts";

const TENANT = TenantIdSchema.parse("Jd8sK2lPq0WnR5tYu3bV");
const principal = PrincipalSchema.parse({ type: "user", uid: "uA1b2C3d4E5f6G7h8I9j", mfa: false });
const execution = { principal, tenantId: TENANT, node: { level: "organization", tenantId: TENANT }, requestId: "req-1", idempotencyKey: "run-1:call-1" } as const;

const define = (executed: unknown[] = []) =>
  defineContractCommand({
    contract: CreateProjectInputContract,
    targetContractId: "tenancy.Project",
    outputSchema: z.strictObject({ projectId: z.string() }),
    summarize: (input) => `Create the project "${input.name}"`,
    preview: (input) => ({ before: null, after: { name: input.name } }),
    execute: (call) => {
      executed.push(call);
      return Promise.resolve({ projectId: "p1" });
    },
  });

describe("defineContractCommand", () => {
  it("takes id, description, permission and input schema from the command contract", () => {
    const command = define();
    expect(command).toMatchObject({
      commandId: "tenancy.CreateProjectInput",
      permission: "core.project.create",
      description: CreateProjectInputContract.meta.description,
      targetContractId: "tenancy.Project",
    });
    expect(command.inputSchema).toBe(CreateProjectInputContract.schema);
  });

  it("runs the use case with the parsed input, the principal and the idempotency key", async () => {
    const executed: unknown[] = [];
    const run = define(executed).prepare({ name: "Launch" });
    expect(await run?.(execution)).toEqual({ projectId: "p1" });
    expect(executed).toEqual([{ ...execution, input: { name: "Launch" } }]);
  });

  it("refuses an input outside the contract schema", () => {
    expect(define().prepare({ name: "Launch", extra: true })).toBeNull();
  });

  it("summarizes and previews with the contract input", () => {
    const command = define();
    expect(command.summarize?.({ name: "Launch" })).toBe('Create the project "Launch"');
    expect(command.preview?.({ name: "Launch" })).toEqual({ before: null, after: { name: "Launch" } });
  });

  it("fails at boot for a contract that is not a command", () => {
    const spec = { targetContractId: "tenancy.Organization", outputSchema: z.strictObject({}), execute: () => Promise.resolve({}) };
    expect(() => defineContractCommand({ ...spec, contract: OrganizationContract })).toThrow(CommandContractError);
  });

  it("fails at boot for a command contract without a permission", () => {
    const contract = defineContract(z.strictObject({ title: z.string().meta({ description: "Title.", pii: "none" }) }), {
      id: "sample.RenameThing",
      kind: "command",
      description: "Renames a thing.",
      examples: [{ title: "x" }],
      pii: "none",
      tenancyScope: "organization",
      relations: [],
    });
    const define = () => defineContractCommand({ contract, targetContractId: "sample.Thing", outputSchema: z.strictObject({}), execute: () => Promise.resolve({}) });
    expect(define).toThrow(/COMMAND_PERMISSION_MISSING/);
  });
});
