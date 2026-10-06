// Entry point only: the handlers live in @core/services (SP1 Task 10).
import { route } from "@/server/core";

export const GET = route("tenancy.getProject");
export const PATCH = route("tenancy.updateProject");
export const DELETE = route("tenancy.deleteProject");
