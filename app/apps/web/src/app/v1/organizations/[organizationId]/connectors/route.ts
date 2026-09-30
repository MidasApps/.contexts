// Entry point only: the handlers live in @core/services (SP3 Task 21).
import { route } from "@/server/core";

export const GET = route("connectors.list");
export const POST = route("connectors.create");
