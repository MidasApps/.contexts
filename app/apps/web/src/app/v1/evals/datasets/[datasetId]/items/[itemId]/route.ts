// Entry point only: the handlers live in @core/services (decision 0062).
import { route } from "@/server/core";

export const DELETE = route("evals.deleteDatasetItem");
