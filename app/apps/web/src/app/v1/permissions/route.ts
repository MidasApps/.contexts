// Entry point only: the handler lives in @core/services (SP1 Task 9).
import { route } from "@/server/core";

export const GET = route("access.listPermissions");
