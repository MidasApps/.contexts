// Entry point only: the handlers live in @core/services (SP1 Task 12).
import { route } from "@/server/core";

export const GET = route("identity.getMe");
export const PATCH = route("identity.updateMe");
