// Entry point only: the handlers live in @core/services (SP1 Task 11).
import { route } from "@/server/core";

export const PATCH = route("access.updateMembership");
export const DELETE = route("access.revokeMembership");
