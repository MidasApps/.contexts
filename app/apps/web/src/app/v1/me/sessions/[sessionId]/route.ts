// Entry point only: the handlers live in @core/services (SP1 Task 13).
import { route } from "@/server/core";

export const DELETE = route("identity.revokeSession");
