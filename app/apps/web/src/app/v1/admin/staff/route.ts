// Entry point only: the handlers live in @core/services (decision 0075).
import { route } from "@/server/core";

export const GET = route("admin.listStaff");
