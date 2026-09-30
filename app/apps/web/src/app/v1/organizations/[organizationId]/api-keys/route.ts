// Entry point only: the handlers live in @core/services (SP1 Task 14).
import { route } from "@/server/core";

export const GET = route("identity.listApiKeys");
export const POST = route("identity.createApiKey");
