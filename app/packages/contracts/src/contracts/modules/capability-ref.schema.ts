import { z } from "zod";
import { none } from "../field-docs.ts";

/**
 * Names an agent, tool, workflow or skill a module implements (umbrella D6). Data only: SP3's
 * `defineAgentModule()` supplies the implementation and composition matches it by `id`
 * (an unknown ref is a boot error, decision 0019). SP3 extends this shape additively.
 */
export const CapabilityRefSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*[.-][A-Za-z0-9.-]+$/, { error: "Expected <module>-<name> or <module>.<name>." })
    .meta(none("Capability id, prefixed by the module id.")),
});
export type CapabilityRef = z.infer<typeof CapabilityRefSchema>;
