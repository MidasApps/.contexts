// Entry point only: the handlers live in @core/services (decision 0049).
import { route } from "@/server/core";

export const GET = route("evals.getExperiment");
