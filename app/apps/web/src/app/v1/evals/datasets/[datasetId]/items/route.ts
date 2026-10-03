// Entry point only: the handlers live in @core/services (decision 0062).
import { route } from "@/server/core";

export const GET = route("evals.listDatasetItems");
export const POST = route("evals.addDatasetItem");
