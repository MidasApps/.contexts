// Entry point only: the handlers live in @core/services (decision 0075).
import { route } from "@/server/core";

export const PUT = route("admin.setStaffRole");
export const DELETE = route("admin.revokeStaff");
