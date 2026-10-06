// Entry point only: the handlers live in @core/services (SP1 Task 9).
import { route } from "@/server/core";

export const GET = route("access.getRole");
export const PATCH = route("access.updateRole");
export const DELETE = route("access.deleteRole");
