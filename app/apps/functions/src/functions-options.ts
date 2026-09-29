/**
 * Deploy-time options shared by every function of this codebase.
 * Region is pinned (stacks/backend/firebase-functions.md, Region): the default
 * `us-central1` is not acceptable for LGPD-regulated data. Changing it later
 * means redeploying each function under a new name, so it is a constant, not
 * an env value.
 */
export const FUNCTIONS_REGION = "southamerica-east1";

/** Runaway-cost guard applied to every function unless it sets its own. */
export const DEFAULT_MAX_INSTANCES = 10;
