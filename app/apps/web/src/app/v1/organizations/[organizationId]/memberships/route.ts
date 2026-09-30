// Entry point only: the handlers live in @core/services (SP1 Task 11).
import { route } from "@/server/core";

export const GET = route("access.listMemberships");
export const POST = route("access.grantMembership");
