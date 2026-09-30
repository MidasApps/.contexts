import { describe, expect, it } from "vitest";
import { assertNoEscalation } from "./escalation-guard.ts";

describe("assertNoEscalation", () => {
  const actor = new Set(["core.project.read", "core.project.update", "core.unit.read"]);

  it("allows granting a subset of the actor's effective permissions", () => {
    expect(assertNoEscalation({ requested: ["core.project.read", "core.unit.read"], actorEffective: actor })).toEqual({ ok: true });
    expect(assertNoEscalation({ requested: [], actorEffective: actor })).toEqual({ ok: true });
  });

  it("lists every requested permission the actor does not hold, sorted and once", () => {
    expect(
      assertNoEscalation({
        requested: ["core.project.delete", "core.project.read", "core.member.invite", "core.project.delete"],
        actorEffective: actor,
      }),
    ).toEqual({ ok: false, missing: ["core.member.invite", "core.project.delete"] });
  });

  it("denies everything to an actor with no permissions", () => {
    expect(assertNoEscalation({ requested: ["core.unit.read"], actorEffective: new Set() })).toEqual({ ok: false, missing: ["core.unit.read"] });
  });
});
