// Entry point only: the handlers live in @core/services (SP1 Task 15).
import { route } from "@/server/core";

export const GET = route("identity.listDevices");
