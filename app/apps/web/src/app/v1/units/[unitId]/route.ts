// Entry point only: the handlers live in @core/services (SP1 Task 10).
import { route } from "@/server/core";

export const GET = route("tenancy.getUnit");
export const PATCH = route("tenancy.updateUnit");
export const DELETE = route("tenancy.deleteUnit");
