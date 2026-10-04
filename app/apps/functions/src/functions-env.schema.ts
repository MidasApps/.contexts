import { InvalidEnvError, ServicesEnvSchema, toEnvIssues } from "@core/services";
import { z } from "zod";

/**
 * Env of the Functions codebase (contracts/secrets.md §5.4). It does not
 * compose the services env: Firebase reserves the `FIREBASE_` prefix in
 * Functions `.env` files, and no function here talks to Postgres yet. Add a
 * variable only when a function reads it; secrets go through `defineSecret`.
 */
const EmulatorHostSchema = z.string().optional();

// Emulator mode accepts unsigned tokens, so a stray host outside local would let
// anyone forge them (follow-up #12c). Declared only to be checked, then dropped.
const EMULATOR_HOST_KEYS = [
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "FIREBASE_DATABASE_EMULATOR_HOST",
  "PUBSUB_EMULATOR_HOST",
] as const;

// Cloud Storage bucket names (lowercase, digits, dots, dashes, underscores).
const BucketNameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, { error: "expected a bucket name" });

export const FunctionsEnvSchema = z
  .object({
    APP_ENV: ServicesEnvSchema.shape.APP_ENV,
    // Set by the Functions runtime and the emulator (never in a .env file); the Admin SDK
    // of the files trigger targets this project.
    GCLOUD_PROJECT: z.string().min(1).optional(),
    // Bucket of uploads (files context); unset = the project's default bucket.
    FILES_BUCKET: BucketNameSchema.optional(),
    // Private agent runtime of the workflow approval trigger (decision 0036); https outside local.
    MASTRA_URL: z.url().optional(),
    // Cloud Run audience of that runtime (X-Serverless-Authorization).
    MASTRA_AUDIENCE: z.url().optional(),
    FIREBASE_AUTH_EMULATOR_HOST: EmulatorHostSchema,
    FIRESTORE_EMULATOR_HOST: EmulatorHostSchema,
    FIREBASE_STORAGE_EMULATOR_HOST: EmulatorHostSchema,
    FIREBASE_DATABASE_EMULATOR_HOST: EmulatorHostSchema,
    PUBSUB_EMULATOR_HOST: EmulatorHostSchema,
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === "local") return;
    if (env.MASTRA_URL?.startsWith("https://") === false)
      ctx.addIssue({ code: "custom", path: ["MASTRA_URL"], message: "https is required outside local" });
    for (const key of EMULATOR_HOST_KEYS) {
      if (env[key]) ctx.addIssue({ code: "custom", path: [key], message: "emulators are local only" });
    }
  })
  .transform(({ APP_ENV, GCLOUD_PROJECT, FILES_BUCKET, MASTRA_URL, MASTRA_AUDIENCE }) => ({
    APP_ENV,
    ...(GCLOUD_PROJECT === undefined ? {} : { GCLOUD_PROJECT }),
    ...(FILES_BUCKET === undefined ? {} : { FILES_BUCKET }),
    ...(MASTRA_URL === undefined ? {} : { MASTRA_URL }),
    ...(MASTRA_AUDIENCE === undefined ? {} : { MASTRA_AUDIENCE }),
  }));

export type FunctionsEnv = z.infer<typeof FunctionsEnvSchema>;

/**
 * Parses the env once at boot (fail-fast by design).
 * @param source usually `process.env`, read only by `src/env.ts`.
 * @throws {InvalidEnvError} naming each invalid variable, never its value.
 */
export const loadFunctionsEnv = (source: Record<string, string | undefined>): FunctionsEnv => {
  const result = FunctionsEnvSchema.safeParse(source);
  if (result.success) return result.data;
  throw new InvalidEnvError(toEnvIssues(result.error));
};
