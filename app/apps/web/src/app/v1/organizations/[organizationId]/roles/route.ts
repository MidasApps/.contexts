// Entry point only: the handlers live in @core/services (SP1 Task 9).
import { route } from "@/server/core";

export const GET = route("access.listRoles");
export const POST = route("access.createRole");
