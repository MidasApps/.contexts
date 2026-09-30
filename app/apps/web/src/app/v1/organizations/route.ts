// Entry point only: the handlers live in @core/services (SP1 Task 10).
import { route } from "@/server/core";

export const POST = route("tenancy.createOrganization");
