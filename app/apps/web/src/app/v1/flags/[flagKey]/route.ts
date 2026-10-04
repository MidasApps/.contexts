// Entry point only: the handlers live in @core/services (SP5, decision 0039).
import { route } from "@/server/core";

export const PUT = route("flags.setTenantValue");
export const DELETE = route("flags.clearTenantOverride");
