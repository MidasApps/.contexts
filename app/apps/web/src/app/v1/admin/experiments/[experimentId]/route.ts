// Entry point only: the handlers live in @core/services (decision 0048).
import { route } from "@/server/core";

export const GET = route("evals.adminGetExperiment");
