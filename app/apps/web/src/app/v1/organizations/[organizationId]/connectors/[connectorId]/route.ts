// Entry point only: the handlers live in @core/services (SP3 Task 21).
import { route } from "@/server/core";

export const GET = route("connectors.get");
export const PATCH = route("connectors.update");
export const DELETE = route("connectors.delete");
