// Entry point only: the handlers live in @core/services (decision 0046).
import { route } from "@/server/core";

export const GET = route("custom-skills.list");
export const POST = route("custom-skills.create");
